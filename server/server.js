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
const YOUTUBE_TOKENS_FILE = path.join(DATA_DIR, 'youtube-tokens.json');

/* ── 쇼츠 폴더 설정 ── */
const SHORTS_DIR = process.env.SHORTS_DIR || path.join(DATA_DIR, 'shorts');
const SHORTS_DONE_DIR = process.env.SHORTS_DIR ? path.join(process.env.SHORTS_DIR, '..', 'shorts-done') : path.join(DATA_DIR, 'shorts-done');
const SHORTS_QUEUE = {}; // 업로드 대기 중인 파일 추적
const YOUTUBE_PRIVACY = process.env.YOUTUBE_PRIVACY || 'unlisted'; // public | unlisted | private

let youtubeOAuth2Client = null;
let youtubeTokens = null;

function initYoutubeClient() {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    console.warn('[YouTube] 클라이언트 ID/Secret이 없습니다. 유튜브 연동이 작동하지 않습니다.');
    return;
  }
  youtubeOAuth2Client = new OAuth2Client(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI);
  loadYoutubeTokens();
}

function loadYoutubeTokens() {
  if (fs.existsSync(YOUTUBE_TOKENS_FILE)) {
    try {
      youtubeTokens = JSON.parse(fs.readFileSync(YOUTUBE_TOKENS_FILE, 'utf8'));
      youtubeOAuth2Client.setCredentials(youtubeTokens);
    } catch (e) {
      console.error('[YouTube] 토큰 로드 실패:', e.message);
    }
  }
}

function saveYoutubeTokens() {
  if (youtubeTokens && youtubeOAuth2Client) {
    const creds = youtubeOAuth2Client.credentials;
    youtubeTokens = { ...youtubeTokens, ...creds };
    try {
      fs.writeFileSync(YOUTUBE_TOKENS_FILE, JSON.stringify(youtubeTokens, null, 2));
    } catch (e) {
      console.error('[YouTube] 토큰 저장 실패:', e.message);
    }
  }
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

/* 쇼츠 자동 업로드 */
async function uploadVideoToYoutube(filePath, fileName) {
  if (!youtubeOAuth2Client || !youtubeTokens) {
    console.error('[YouTube] 인증되지 않아 업로드를 건너뜁니다:', fileName);
    return false;
  }

  try {
    youtubeOAuth2Client.setCredentials(youtubeTokens);
    const youtube = google.youtube({ version: 'v3', auth: youtubeOAuth2Client });

    // 파일명에서 제목 추출 (확장자 제거)
    const title = path.parse(fileName).name;
    const fileSize = fs.statSync(filePath).size;

    console.log(`[YouTube] 업로드 시작: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

    const fileStream = fs.createReadStream(filePath);
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: title,
            description: `자동 생성된 쇼츠 - ${new Date().toLocaleString('ko-KR')}`,
            tags: ['shorts', 'auto-generated'],
            categoryId: '22',
          },
          status: {
            privacyStatus: YOUTUBE_PRIVACY,
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
          console.log(`[YouTube] ${fileName} 업로드 진행: ${progress}%`);
        },
      }
    );

    youtubeTokens = youtubeOAuth2Client.credentials;
    saveYoutubeTokens();

    const videoId = response.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[YouTube] 업로드 완료: ${fileName} → ${videoUrl}`);

    // 완료 폴더로 이동
    if (!fs.existsSync(SHORTS_DONE_DIR)) {
      fs.mkdirSync(SHORTS_DONE_DIR, { recursive: true });
    }
    const doneFilePath = path.join(SHORTS_DONE_DIR, `${path.parse(fileName).name}_${videoId}${path.extname(fileName)}`);
    fs.renameSync(filePath, doneFilePath);

    // DB에 기록
    db.state.youtubeUploads = db.state.youtubeUploads || [];
    db.state.youtubeUploads.push({
      fileName,
      videoId,
      videoUrl,
      uploadedAt: new Date().toISOString(),
    });
    saveDB();

    return true;
  } catch (e) {
    console.error(`[YouTube] 업로드 실패 (${fileName}):`, e.message);
    return false;
  }
}

let shortsProcessing = false;
async function processShortsQueue() {
  if (shortsProcessing) return;
  shortsProcessing = true;
  try {
    for (const filePath of Object.keys(SHORTS_QUEUE)) {
      const item = SHORTS_QUEUE[filePath];
      if (item.status !== 'pending') continue;
      if (!youtubeOAuth2Client || !youtubeTokens) {
        const pendingCount = Object.values(SHORTS_QUEUE).filter((q) => q.status === 'pending').length;
        console.log(`[YouTube] 인증 대기 중 (대기 영상 ${pendingCount}개) → 브라우저에서 http://localhost:${PORT}/api/youtube/auth-url 열어서 로그인하세요`);
        break;
      }
      item.status = 'uploading';
      const success = await uploadVideoToYoutube(filePath, item.fileName);
      if (success) delete SHORTS_QUEUE[filePath];
      else item.status = 'failed';
    }
  } finally {
    shortsProcessing = false;
  }
}

function initShortsWatcher() {
  if (!fs.existsSync(SHORTS_DIR)) {
    fs.mkdirSync(SHORTS_DIR, { recursive: true });
  }

  const watcher = chokidar.watch(SHORTS_DIR, {
    ignored: /(^|[\/\\])\.|\.tmp$/,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on('add', (filePath) => {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();

    if (!['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
      console.log('[Shorts] 영상 파일이 아닙니다:', fileName);
      return;
    }

    console.log('[Shorts] 새 영상 감지:', fileName);
    SHORTS_QUEUE[filePath] = { fileName, status: 'pending', addedAt: Date.now() };

    // 1초 후에 업로드 시작 (다른 파일 추가 대기)
    setTimeout(processShortsQueue, 1000);
  });

  watcher.on('error', (error) => {
    console.error('[Shorts] 감시 에러:', error);
  });

  console.log(`[Shorts] 폴더 감시 시작: ${SHORTS_DIR}`);
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

/* YouTube 인증 URL 생성 */
app.get('/api/youtube/auth-url', (req, res) => {
  if (!youtubeOAuth2Client) {
    return res.status(500).json({ error: 'YouTube 클라이언트가 초기화되지 않았습니다.' });
  }
  const authUrl = youtubeOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
  });
  if (req.query.json !== undefined) return res.json({ authUrl });
  res.redirect(authUrl);
});

/* YouTube OAuth 콜백 */
app.get('/api/youtube/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  const page = (title, body) =>
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${title}</h2><p>${body}</p></body>`;
  if (error) {
    return res.status(400).send(page('YouTube 인증 실패', String(error)));
  }
  if (!code) {
    return res.status(400).send(page('YouTube 인증 실패', '인증 코드가 없습니다.'));
  }
  try {
    const { tokens } = await youtubeOAuth2Client.getToken(code);
    youtubeOAuth2Client.setCredentials(tokens);
    youtubeTokens = tokens;
    saveYoutubeTokens();
    console.log('[YouTube] 인증 완료. 대기 중인 영상 업로드를 시작합니다.');
    const pendingCount = Object.values(SHORTS_QUEUE).filter((q) => q.status === 'pending').length;
    processShortsQueue();
    res.send(page('YouTube 인증 완료 ✅', `이 창은 닫아도 됩니다. 대기 중인 영상 ${pendingCount}개 업로드를 시작했습니다. 진행 상황은 서버 창(cmd)에서 확인하세요.`));
  } catch (e) {
    console.error('[YouTube] 토큰 획득 실패:', e.message);
    res.status(500).send(page('YouTube 인증 실패', `토큰 획득 실패: ${e.message}`));
  }
});

/* YouTube 업로드 상태 확인 */
app.get('/api/youtube/status', (req, res) => {
  const authenticated = !!youtubeTokens && !!youtubeTokens.access_token;
  res.json({ authenticated, hasTokens: !!youtubeTokens });
});

/* 쇼츠 폴더 상태 확인 */
app.get('/api/shorts/status', (req, res) => {
  const uploadedCount = db.state.youtubeUploads ? db.state.youtubeUploads.length : 0;
  res.json({
    shortsDir: SHORTS_DIR,
    shortsExists: fs.existsSync(SHORTS_DIR),
    queue: SHORTS_QUEUE,
    uploadedCount,
    recentUploads: db.state.youtubeUploads ? db.state.youtubeUploads.slice(-5).reverse() : [],
  });
});

/* YouTube 영상 업로드 */
app.post('/api/youtube/upload', auth, upload.single('video'), async (req, res) => {
  if (!youtubeOAuth2Client || !youtubeTokens) {
    return res.status(400).json({ error: 'YouTube 인증이 필요합니다. /api/youtube/auth-url에서 인증하세요.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: '영상 파일이 필요합니다.' });
  }

  const { title, description, tags } = req.body || {};
  if (!title) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '제목(title)이 필요합니다.' });
  }

  try {
    youtubeOAuth2Client.setCredentials(youtubeTokens);
    const youtube = google.youtube({ version: 'v3', auth: youtubeOAuth2Client });

    const fileStream = fs.createReadStream(req.file.path);
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description: description || '',
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            categoryId: '22', // 기본: 단편 영화
          },
          status: {
            privacyStatus: 'private', // private, unlisted, public 중 선택
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
          console.log(`[YouTube] 업로드 진행률: ${progress}%`);
        },
      }
    );

    // 토큰 업데이트 저장
    youtubeTokens = youtubeOAuth2Client.credentials;
    saveYoutubeTokens();

    // 임시 파일 삭제
    fs.unlinkSync(req.file.path);

    res.json({
      ok: true,
      videoId: response.data.id,
      title: response.data.snippet.title,
      url: `https://www.youtube.com/watch?v=${response.data.id}`,
    });
  } catch (e) {
    console.error('[YouTube] 업로드 실패:', e.message);
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
