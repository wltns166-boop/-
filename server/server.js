/* ═══════════════════════════════════════════════════════════
   InsureNet 백엔드 서버
   - PC / 모바일이 같은 데이터를 보도록 동기화하는 REST API
   - JWT 로그인 인증 + 공유 데이터 저장소(JSON 파일)
   - 프론트엔드(HTML/PWA)도 같은 서버에서 서빙
═══════════════════════════════════════════════════════════ */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const multer = require('multer');
const chokidar = require('chokidar');

const ROOT = path.join(__dirname, '..');          // 프로젝트 루트 (HTML 위치)
// 배포 시 영속 디스크 경로를 DATA_DIR 환경변수로 지정할 수 있음 (재배포해도 데이터 유지)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const PORT = process.env.PORT || 4000;
// 운영 시에는 반드시 환경변수 JWT_SECRET 을 지정하세요. 미지정 시 임시 키 생성.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '12h';

/* ── YouTube API 설정 ── */
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:4000/api/youtube/auth/callback';
const YOUTUBE_TOKENS_DIR = path.join(DATA_DIR, 'youtube-tokens');
const LEGACY_TOKENS_FILE = path.join(DATA_DIR, 'youtube-tokens.json');

/* ── 쇼츠 폴더 설정 ──
   SHORTS_DIR 바로 아래 파일  → 'default' 채널
   SHORTS_DIR/<채널폴더>/파일 → 그 폴더 이름의 채널 (폴더마다 별도 로그인) */
const SHORTS_DIR = process.env.SHORTS_DIR || path.join(DATA_DIR, 'shorts');
const SHORTS_DONE_DIR = process.env.SHORTS_DIR ? path.join(process.env.SHORTS_DIR, '..', 'shorts-done') : path.join(DATA_DIR, 'shorts-done');
const SHORTS_QUEUE = {}; // 업로드 대기 중인 파일 추적
const YOUTUBE_PRIVACY = process.env.YOUTUBE_PRIVACY || 'unlisted'; // public | unlisted | private
const DEFAULT_CHANNEL = 'default';
const CHANNEL_NAME_RE = /^[\w가-힣][\w가-힣 .\-]{0,60}$/;

const channelTokens = {};  // 채널명 → 토큰
const channelClients = {}; // 채널명 → OAuth2Client
let youtubeEnabled = false;

function initYoutubeClient() {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    console.warn('[YouTube] 클라이언트 ID/Secret이 없습니다. 유튜브 연동이 작동하지 않습니다.');
    return;
  }
  youtubeEnabled = true;
  loadAllChannelTokens();
}

function tokenFileFor(channel) {
  return path.join(YOUTUBE_TOKENS_DIR, `${channel}.json`);
}

function loadAllChannelTokens() {
  if (!fs.existsSync(YOUTUBE_TOKENS_DIR)) fs.mkdirSync(YOUTUBE_TOKENS_DIR, { recursive: true });
  // 예전 단일 토큰 파일은 default 채널로 이전
  if (fs.existsSync(LEGACY_TOKENS_FILE) && !fs.existsSync(tokenFileFor(DEFAULT_CHANNEL))) {
    fs.renameSync(LEGACY_TOKENS_FILE, tokenFileFor(DEFAULT_CHANNEL));
  }
  for (const f of fs.readdirSync(YOUTUBE_TOKENS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const channel = f.slice(0, -5);
    try {
      channelTokens[channel] = JSON.parse(fs.readFileSync(path.join(YOUTUBE_TOKENS_DIR, f), 'utf8'));
    } catch (e) {
      console.error(`[YouTube] 토큰 로드 실패 (${channel}):`, e.message);
    }
  }
}

function saveChannelTokens(channel, tokens) {
  channelTokens[channel] = { ...(channelTokens[channel] || {}), ...tokens };
  try {
    fs.writeFileSync(tokenFileFor(channel), JSON.stringify(channelTokens[channel], null, 2));
  } catch (e) {
    console.error(`[YouTube] 토큰 저장 실패 (${channel}):`, e.message);
  }
}

function newOAuthClient() {
  return new OAuth2Client(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI);
}

function isChannelAuthed(channel) {
  return youtubeEnabled && !!channelTokens[channel];
}

function clientFor(channel) {
  if (!isChannelAuthed(channel)) return null;
  if (!channelClients[channel]) {
    const client = newOAuthClient();
    client.setCredentials(channelTokens[channel]);
    client.on('tokens', (t) => saveChannelTokens(channel, t));
    channelClients[channel] = client;
  }
  return channelClients[channel];
}

function channelForFile(filePath) {
  const rel = path.relative(SHORTS_DIR, filePath);
  const parts = rel.split(/[\\/]/);
  return parts.length > 1 ? parts[0] : DEFAULT_CHANNEL;
}

function listChannelFolders() {
  if (!fs.existsSync(SHORTS_DIR)) return [];
  return fs.readdirSync(SHORTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);
}

function authUrlFor(channel) {
  if (channel === DEFAULT_CHANNEL) return `http://localhost:${PORT}/api/youtube/auth-url`;
  const q = /^[\w가-힣.\-]+$/.test(channel) ? channel : encodeURIComponent(channel);
  return `http://localhost:${PORT}/api/youtube/auth-url?channel=${q}`;
}


const uploadDisk = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DATA_DIR, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const upload = multer({ storage: uploadDisk, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

/* ── 영상 메타데이터 사이드카 (영상.mp4 옆의 영상.mp4.json) ── */
function sidecarPathFor(filePath) {
  return `${filePath}.json`;
}

function readSidecarMeta(filePath) {
  const p = sidecarPathFor(filePath);
  if (!fs.existsSync(p)) return {};
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      title: typeof m.title === 'string' ? m.title.slice(0, 100) : undefined,
      description: typeof m.description === 'string' ? m.description.slice(0, 5000) : undefined,
      tags: Array.isArray(m.tags) ? m.tags.map(String).slice(0, 30) : undefined,
      privacy: ['public', 'unlisted', 'private'].includes(m.privacy) ? m.privacy : undefined,
    };
  } catch (e) {
    console.error('[Shorts] 메타 파일 읽기 실패:', p, e.message);
    return {};
  }
}

/* ── 원격 업로드 대기열 (GitHub의 shorts-queue.json 을 주기적으로 확인해 영상을 받아옴) ── */
const SHORTS_QUEUE_URL = process.env.SHORTS_QUEUE_URL || 'https://raw.githubusercontent.com/wltns166-boop/-/claude/vigilant-thompson-f9r2pz/shorts-queue.json';
const SHORTS_QUEUE_INTERVAL = Math.max(15, Number(process.env.SHORTS_QUEUE_INTERVAL) || 60) * 1000;
const SAFE_FILENAME_RE = /^[^\\/:*?"<>|]{1,150}\.(mp4|mov|webm|mkv|avi)$/i;
let queueFetching = false;

async function downloadToFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tmp = `${destPath}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, destPath);
}

async function fetchRemoteQueue() {
  if (queueFetching || !SHORTS_QUEUE_URL) return;
  queueFetching = true;
  try {
    const res = await fetch(`${SHORTS_QUEUE_URL}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    db.state.shortsQueueDone = db.state.shortsQueueDone || [];
    const done = new Set(db.state.shortsQueueDone);

    for (const item of items) {
      if (!item || typeof item.id !== 'string' || done.has(item.id)) continue;
      const channel = typeof item.channel === 'string' && item.channel ? item.channel : DEFAULT_CHANNEL;
      if (!CHANNEL_NAME_RE.test(channel) || !SAFE_FILENAME_RE.test(item.fileName || '') || !/^https?:\/\//.test(item.url || '')) {
        console.error('[Queue] 잘못된 항목 건너뜀:', item.id);
        continue;
      }
      const dir = channel === DEFAULT_CHANNEL ? SHORTS_DIR : path.join(SHORTS_DIR, channel);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, item.fileName);

      try {
        console.log(`[Queue:${channel}] 다운로드 시작: ${item.fileName}`);
        fs.writeFileSync(sidecarPathFor(dest), JSON.stringify({
          title: item.title, description: item.description, tags: item.tags, privacy: item.privacy,
        }, null, 2));
        await downloadToFile(item.url, dest);
        console.log(`[Queue:${channel}] 다운로드 완료: ${item.fileName} (감시 폴더에 저장됨, 곧 업로드됩니다)`);
        db.state.shortsQueueDone.push(item.id);
        saveDB();
      } catch (e) {
        console.error(`[Queue:${channel}] 다운로드 실패 (${item.fileName}):`, e.message);
        try { fs.unlinkSync(sidecarPathFor(dest)); } catch {}
      }
    }
  } catch (e) {
    console.error('[Queue] 대기열 확인 실패:', e.message);
  } finally {
    queueFetching = false;
  }
}

function initRemoteQueue() {
  if (!SHORTS_QUEUE_URL) return;
  console.log(`[Queue] 원격 대기열 확인 시작 (${SHORTS_QUEUE_INTERVAL / 1000}초마다): ${SHORTS_QUEUE_URL}`);
  fetchRemoteQueue();
  setInterval(fetchRemoteQueue, SHORTS_QUEUE_INTERVAL);
}

/* 쇼츠 자동 업로드 */
async function uploadVideoToYoutube(filePath, fileName, channel) {
  const client = clientFor(channel);
  if (!client) {
    console.error(`[YouTube] 채널 '${channel}' 인증이 없어 건너뜁니다:`, fileName);
    return false;
  }

  try {
    const youtube = google.youtube({ version: 'v3', auth: client });

    // 같은 이름의 .json 파일이 있으면 제목/설명/태그/공개범위를 거기서 읽음
    const meta = readSidecarMeta(filePath);
    const title = meta.title || path.parse(fileName).name;
    const fileSize = fs.statSync(filePath).size;

    console.log(`[YouTube:${channel}] 업로드 시작: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

    let lastLogged = -10;
    const fileStream = fs.createReadStream(filePath);
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description: meta.description || '',
            tags: meta.tags || ['shorts'],
            categoryId: '22',
          },
          status: {
            privacyStatus: meta.privacy || YOUTUBE_PRIVACY,
            madeForKids: false,
          },
        },
        media: {
          mimeType: 'video/mp4',
          body: fileStream,
        },
      },
      {
        onUploadProgress: (evt) => {
          const progress = Math.round((evt.bytesRead / fileSize) * 100);
          if (progress - lastLogged >= 10 || progress === 100) {
            lastLogged = progress;
            console.log(`[YouTube:${channel}] ${fileName} 업로드 진행: ${progress}%`);
          }
        },
      }
    );

    const videoId = response.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[YouTube:${channel}] 업로드 완료: ${fileName} → ${videoUrl}`);

    // 완료 폴더로 이동 (채널 폴더 구조 유지)
    const doneDir = channel === DEFAULT_CHANNEL ? SHORTS_DONE_DIR : path.join(SHORTS_DONE_DIR, channel);
    if (!fs.existsSync(doneDir)) {
      fs.mkdirSync(doneDir, { recursive: true });
    }
    const doneFilePath = path.join(doneDir, `${path.parse(fileName).name}_${videoId}${path.extname(fileName)}`);
    fs.renameSync(filePath, doneFilePath);
    const sidecar = sidecarPathFor(filePath);
    if (fs.existsSync(sidecar)) fs.renameSync(sidecar, `${doneFilePath}.json`);

    // DB에 기록
    db.state.youtubeUploads = db.state.youtubeUploads || [];
    db.state.youtubeUploads.push({
      fileName,
      channel,
      videoId,
      videoUrl,
      uploadedAt: new Date().toISOString(),
    });
    saveDB();

    return true;
  } catch (e) {
    console.error(`[YouTube:${channel}] 업로드 실패 (${fileName}):`, e.message);
    return false;
  }
}

let shortsProcessing = false;
let queueTimer = null;
async function processShortsQueue() {
  if (shortsProcessing) return;
  shortsProcessing = true;
  try {
    const waitingChannels = new Set();
    for (const filePath of Object.keys(SHORTS_QUEUE)) {
      const item = SHORTS_QUEUE[filePath];
      if (item.status !== 'pending') continue;
      if (!isChannelAuthed(item.channel)) {
        waitingChannels.add(item.channel);
        continue;
      }
      item.status = 'uploading';
      const success = await uploadVideoToYoutube(filePath, item.fileName, item.channel);
      if (success) delete SHORTS_QUEUE[filePath];
      else item.status = 'failed';
    }
    for (const channel of waitingChannels) {
      const count = Object.values(SHORTS_QUEUE).filter((q) => q.status === 'pending' && q.channel === channel).length;
      console.log(`[YouTube] 채널 '${channel}' 인증 대기 중 (대기 영상 ${count}개) → 브라우저에서 ${authUrlFor(channel)} 열어서 로그인하세요`);
    }
  } finally {
    shortsProcessing = false;
  }
}

function initShortsWatcher() {
  if (!fs.existsSync(SHORTS_DIR)) {
    fs.mkdirSync(SHORTS_DIR, { recursive: true });
  }

  // OneDrive/네트워크 폴더는 OS 변경 알림이 누락되는 경우가 있어 폴링으로 감시
  const watcher = chokidar.watch(SHORTS_DIR, {
    ignored: /(^|[\/\\])\.|\.tmp$/,
    persistent: true,
    usePolling: true,
    interval: 3000,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on('add', (filePath) => {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();

    if (!['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
      if (ext !== '.json') console.log('[Shorts] 영상 파일이 아닙니다:', fileName);
      return;
    }

    const channel = channelForFile(filePath);
    if (!CHANNEL_NAME_RE.test(channel)) {
      console.log(`[Shorts] 채널 폴더 이름이 올바르지 않습니다 (한글/영문/숫자/공백만 가능): ${channel}`);
      return;
    }

    console.log(`[Shorts:${channel}] 새 영상 감지:`, fileName);
    SHORTS_QUEUE[filePath] = { fileName, channel, status: 'pending', addedAt: Date.now() };

    // 1초 후에 업로드 시작 (다른 파일 추가 대기)
    clearTimeout(queueTimer);
    queueTimer = setTimeout(processShortsQueue, 1000);
  });

  watcher.on('error', (error) => {
    console.error('[Shorts] 감시 에러:', error);
  });

  console.log(`[Shorts] 폴더 감시 시작: ${SHORTS_DIR}`);
  const folders = listChannelFolders();
  if (folders.length) {
    console.log('[Shorts] 채널 폴더:');
    for (const ch of folders) {
      console.log(`  - ${ch}: ${isChannelAuthed(ch) ? '로그인됨 ✅' : `로그인 필요 → ${authUrlFor(ch)}`}`);
    }
  }
}


/* ── 초기 사용자 (최초 1회만 시드, 비밀번호는 해시 저장) ── */
const SEED_USERS = {
  admin: { pw: 'admin1234', name: '관리자', dept: '관리팀',  role: 'admin', avatar: '관', color: '#8b5cf6' },
  fc1:   { pw: 'fc1234',    name: '김철수', dept: '영업1팀', role: 'fc',    avatar: '김', color: '#1e5ef3' },
  fc2:   { pw: 'fc2234',    name: '이영희', dept: '영업1팀', role: 'fc',    avatar: '이', color: '#10b981' },
};

/* ── 프론트엔드가 동기화하는 데이터 키 화이트리스트 ── */
const STATE_KEYS = [
  'customers', 'medicals', 'claims', 'dbreqs', 'notices',
  'calEvents', 'chats', 'staff', 'orgNodes', 'notifs',
];

/* ═══════════════════════════════════════
   DB 로드 / 저장 (JSON 파일, 원자적 쓰기)
═══════════════════════════════════════ */
let db = { users: {}, state: {}, version: 0, updatedAt: {} };

function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('[DB] db.json 파싱 실패, 새로 시작합니다:', e.message);
    }
  }
  db.users = db.users || {};
  db.state = db.state || {};
  db.updatedAt = db.updatedAt || {};
  db.version = db.version || 0;

  // 사용자 시드 (없을 때만)
  let seeded = false;
  for (const [id, u] of Object.entries(SEED_USERS)) {
    if (!db.users[id]) {
      const { pw, ...rest } = u;
      db.users[id] = { id, ...rest, pwHash: bcrypt.hashSync(pw, 10) };
      seeded = true;
    }
  }
  if (seeded) saveDB();
}

let saveTimer = null;
let dirty = false;

/* 실제 디스크 쓰기 (원자적: temp 작성 후 rename) */
function flushDB() {
  if (!dirty) return;
  clearTimeout(saveTimer); saveTimer = null;
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
    dirty = false;
  } catch (e) {
    console.error('[DB] 저장 실패:', e.message);
  }
}

function saveDB() {
  // 잦은 쓰기를 묶어 디스크 부담 완화 (200ms 디바운스)
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; flushDB(); }, 200);
}

/* 종료 시 디바운스 대기 중인 변경을 반드시 디스크에 기록 (재배포 시 데이터 유실 방지) */
function gracefulExit(signal) {
  flushDB();
  process.exit(0);
}
process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('SIGINT', () => gracefulExit('SIGINT'));

/* ═══════════════════════════════════════
   인증 미들웨어
═══════════════════════════════════════ */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '인증 토큰이 없습니다.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '토큰이 만료되었거나 유효하지 않습니다.' });
  }
}

function publicUser(u) {
  return { id: u.id, name: u.name, dept: u.dept, role: u.role, avatar: u.avatar, color: u.color };
}

/* ═══════════════════════════════════════
   앱 구성
═══════════════════════════════════════ */
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

/* ── 로그인 ── */
app.post('/api/login', (req, res) => {
  const { id, pw } = req.body || {};
  const u = db.users[id];
  if (!u || !bcrypt.compareSync(String(pw || ''), u.pwHash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  const token = jwt.sign(publicUser(u), JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, user: publicUser(u) });
});

/* ── 현재 사용자 확인 ── */
app.get('/api/me', auth, (req, res) => {
  const u = db.users[req.user.id];
  if (!u) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ user: publicUser(u) });
});

/* ── 전체 공유 데이터 조회 ── */
app.get('/api/state', auth, (req, res) => {
  res.json({ data: db.state, version: db.version, updatedAt: db.updatedAt });
});

/* ── 변경 감지용 경량 버전 조회 (폴링) ── */
app.get('/api/state/version', auth, (req, res) => {
  res.json({ version: db.version });
});

/* ── 특정 키 데이터 저장 (덮어쓰기, last-write-wins) ── */
app.put('/api/state/:key', auth, (req, res) => {
  const { key } = req.params;
  if (!STATE_KEYS.includes(key)) {
    return res.status(400).json({ error: `허용되지 않은 데이터 키: ${key}` });
  }
  if (!('value' in (req.body || {}))) {
    return res.status(400).json({ error: 'value 필드가 필요합니다.' });
  }
  db.state[key] = req.body.value;
  db.version += 1;
  db.updatedAt[key] = { at: Date.now(), by: req.user.id };
  saveDB();
  res.json({ ok: true, version: db.version });
});

/* ── 여러 키를 한 번에 저장 (초기 업로드 등) ── */
app.put('/api/state', auth, (req, res) => {
  const incoming = (req.body && req.body.data) || {};
  let changed = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (!STATE_KEYS.includes(key)) continue;
    db.state[key] = value;
    db.updatedAt[key] = { at: Date.now(), by: req.user.id };
    changed += 1;
  }
  if (changed) { db.version += 1; saveDB(); }
  res.json({ ok: true, changed, version: db.version });
});

/* ── 헬스 체크 ── */
app.get('/api/health', (req, res) => res.json({ ok: true, version: db.version }));

/* ═══════════════════════════════════════
   YouTube API 엔드포인트
═══════════════════════════════════════ */

/* YouTube 인증 URL 생성 (?channel=폴더명 으로 채널 지정, 없으면 default) */
app.get('/api/youtube/auth-url', (req, res) => {
  if (!youtubeEnabled) {
    return res.status(500).json({ error: 'YouTube 클라이언트가 초기화되지 않았습니다.' });
  }
  const channel = (req.query.channel || DEFAULT_CHANNEL).toString();
  if (!CHANNEL_NAME_RE.test(channel)) {
    return res.status(400).json({ error: '채널 이름은 한글/영문/숫자/공백만 가능합니다.' });
  }
  const authUrl = newOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
    state: channel,
  });
  if (req.query.json !== undefined) return res.json({ authUrl, channel });
  res.redirect(authUrl);
});

/* YouTube OAuth 콜백 */
app.get('/api/youtube/auth/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const channel = state && CHANNEL_NAME_RE.test(String(state)) ? String(state) : DEFAULT_CHANNEL;
  const page = (title, body) =>
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${title}</h2><p>${body}</p></body>`;
  if (error) {
    return res.status(400).send(page('YouTube 인증 실패', String(error)));
  }
  if (!code) {
    return res.status(400).send(page('YouTube 인증 실패', '인증 코드가 없습니다.'));
  }
  try {
    const { tokens } = await newOAuthClient().getToken(code);
    delete channelClients[channel];
    saveChannelTokens(channel, tokens);
    const pendingCount = Object.values(SHORTS_QUEUE).filter((q) => q.status === 'pending' && q.channel === channel).length;
    console.log(`[YouTube] 채널 '${channel}' 인증 완료. 대기 중인 영상 ${pendingCount}개 업로드를 시작합니다.`);
    processShortsQueue();
    res.send(page(`YouTube 인증 완료 ✅ (채널 폴더: ${channel})`, `이 창은 닫아도 됩니다. 대기 중인 영상 ${pendingCount}개 업로드를 시작했습니다. 진행 상황은 서버 창(cmd)에서 확인하세요.`));
  } catch (e) {
    console.error('[YouTube] 토큰 획득 실패:', e.message);
    res.status(500).send(page('YouTube 인증 실패', `토큰 획득 실패: ${e.message}`));
  }
});

/* YouTube 인증 상태 확인 (채널별) */
app.get('/api/youtube/status', (req, res) => {
  const channels = {};
  for (const ch of new Set([DEFAULT_CHANNEL, ...listChannelFolders(), ...Object.keys(channelTokens)])) {
    channels[ch] = { authenticated: isChannelAuthed(ch), authUrl: authUrlFor(ch) };
  }
  res.json({ enabled: youtubeEnabled, channels });
});

/* 쇼츠 폴더 상태 확인 */
app.get('/api/shorts/status', (req, res) => {
  const uploadedCount = db.state.youtubeUploads ? db.state.youtubeUploads.length : 0;
  res.json({
    shortsDir: SHORTS_DIR,
    shortsExists: fs.existsSync(SHORTS_DIR),
    channelFolders: listChannelFolders(),
    queue: SHORTS_QUEUE,
    uploadedCount,
    recentUploads: db.state.youtubeUploads ? db.state.youtubeUploads.slice(-5).reverse() : [],
  });
});

/* YouTube 영상 업로드 (body.channel 로 채널 지정, 없으면 default) */
app.post('/api/youtube/upload', auth, upload.single('video'), async (req, res) => {
  const { title, description, tags } = req.body || {};
  const channel = (req.body && req.body.channel) || DEFAULT_CHANNEL;
  const client = CHANNEL_NAME_RE.test(channel) ? clientFor(channel) : null;
  if (!client) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `채널 '${channel}' YouTube 인증이 필요합니다. ${authUrlFor(channel)} 에서 인증하세요.` });
  }
  if (!req.file) {
    return res.status(400).json({ error: '영상 파일이 필요합니다.' });
  }
  if (!title) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '제목(title)이 필요합니다.' });
  }

  try {
    const youtube = google.youtube({ version: 'v3', auth: client });

    const fileStream = fs.createReadStream(req.file.path);
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description: description || '',
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            categoryId: '22',
          },
          status: {
            privacyStatus: YOUTUBE_PRIVACY,
            madeForKids: false,
          },
        },
        media: {
          mimeType: req.file.mimetype || 'video/mp4',
          body: fileStream,
        },
      },
      {
        onUploadProgress: (evt) => {
          const progress = Math.round((evt.bytesRead / req.file.size) * 100);
          console.log(`[YouTube:${channel}] 업로드 진행률: ${progress}%`);
        },
      }
    );

    // 임시 파일 삭제
    fs.unlinkSync(req.file.path);

    res.json({
      ok: true,
      channel,
      videoId: response.data.id,
      title: response.data.snippet.title,
      url: `https://www.youtube.com/watch?v=${response.data.id}`,
    });
  } catch (e) {
    console.error(`[YouTube:${channel}] 업로드 실패:`, e.message);
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: `업로드 실패: ${e.message}` });
  }
});


/* ═══════════════════════════════════════
   프론트엔드 / PWA 정적 서빙
═══════════════════════════════════════ */
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'insurance-intranet-v2.html')));
// PWA 관련 파일만 명시적으로 노출 (.git, server 등은 비공개)
for (const f of ['insurance-intranet-v2.html', 'manifest.webmanifest', 'sw.js', 'app-icon.svg']) {
  app.get('/' + f, (req, res) => res.sendFile(path.join(ROOT, f)));
}

/* ═══════════════════════════════════════
   시작
═══════════════════════════════════════ */
loadDB();
initYoutubeClient();
initShortsWatcher();
initRemoteQueue();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  InsureNet 서버 실행 중`);
  console.log(`  ─ 로컬:   http://localhost:${PORT}`);
  console.log(`  ─ 같은 와이파이의 폰에서 접속하려면 PC의 내부 IP를 사용하세요`);
  console.log(`    예) http://192.168.0.10:${PORT}\n`);
  if (!process.env.JWT_SECRET) {
    console.warn('  ⚠  JWT_SECRET 환경변수가 없어 임시 키를 사용합니다. 재시작 시 모든 로그인이 풀립니다.');
    console.warn('     운영 시:  JWT_SECRET=원하는비밀문자열 npm start\n');
  }
});
