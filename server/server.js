/* ═══════════════════════════════════════════════════════════
   InsureNet 백엔드 서버
   - PC / 모바일이 같은 데이터를 보도록 동기화하는 REST API
   - JWT 로그인 인증 + 공유 데이터 저장소(JSON 파일)
   - 프론트엔드(HTML/PWA)도 같은 서버에서 서빙
═══════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');          // 프로젝트 루트 (HTML 위치)
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const PORT = process.env.PORT || 4000;
// 운영 시에는 반드시 환경변수 JWT_SECRET 을 지정하세요. 미지정 시 임시 키 생성.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '12h';

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
function saveDB() {
  // 잦은 쓰기를 묶어 디스크 부담 완화 (200ms 디바운스)
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, DB_FILE);
    } catch (e) {
      console.error('[DB] 저장 실패:', e.message);
    }
  }, 200);
}

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
