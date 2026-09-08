/* ═══════════════════════════════════════════════════════════
   우리집 가계부 동기화 서버 (개인용)
   - 컴퓨터 여러 대가 같은 가계부 데이터를 보도록 동기화하는 REST API
   - 비밀번호 하나로 잠금 (개인용이므로 계정 없음) + 토큰 발급
   - 프론트엔드(household-budget.html)도 같은 서버에서 서빙
   - 보험 인트라넷 서버(server/)와는 완전히 별개 (기본 포트 4001)
═══════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');          // 프로젝트 루트 (HTML 위치)
// 배포 시 영속 디스크 경로를 DATA_DIR 환경변수로 지정할 수 있음
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const PORT = process.env.PORT || 4001;
// 접속 비밀번호. 운영 시 반드시 PASSWORD 환경변수로 바꾸세요.
const PASSWORD = process.env.PASSWORD || 'budget1234';
// 토큰 서명 키. 미지정 시 임시 키 생성 (재시작하면 다시 비밀번호를 물음)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '30d';   // 개인용이므로 넉넉하게 (기기마다 30일에 한 번 입력)

/* ── 프론트엔드가 동기화하는 데이터 키 화이트리스트 ── */
const STATE_KEYS = ['tx', 'budgets', 'recurring', 'cats', 'menu', 'cards', 'cardTx'];

/* ═══════════════════════════════════════
   DB 로드 / 저장 (JSON 파일, 원자적 쓰기)
═══════════════════════════════════════ */
let db = { state: {}, version: 0, updatedAt: {} };

function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('[DB] db.json 파싱 실패, 새로 시작합니다:', e.message);
    }
  }
  db.state = db.state || {};
  db.updatedAt = db.updatedAt || {};
  db.version = db.version || 0;
}

let saveTimer = null;
let dirty = false;

/* 실제 디스크 쓰기 (원자적: temp 작성 후 rename) */
function flushDB() {
  if (!dirty) return;
  clearTimeout(saveTimer); saveTimer = null;
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
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

/* 종료 시 디바운스 대기 중인 변경을 반드시 디스크에 기록 */
function gracefulExit() {
  flushDB();
  process.exit(0);
}
process.on('SIGTERM', gracefulExit);
process.on('SIGINT', gracefulExit);

/* ═══════════════════════════════════════
   인증 (비밀번호 1개 → 토큰)
═══════════════════════════════════════ */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '인증 토큰이 없습니다.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '토큰이 만료되었거나 유효하지 않습니다.' });
  }
}

/* 무차별 대입 완화: 실패 시 잠깐 대기 */
let failCount = 0;

/* ═══════════════════════════════════════
   앱 구성
═══════════════════════════════════════ */
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* ── 로그인 (비밀번호 확인 → 토큰 발급) ── */
app.post('/api/login', (req, res) => {
  const { pw } = req.body || {};
  const ok = crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(pw || '')).digest(),
    crypto.createHash('sha256').update(PASSWORD).digest()
  );
  if (!ok) {
    failCount = Math.min(failCount + 1, 10);
    const wait = failCount * 500;
    return setTimeout(() => res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' }), wait);
  }
  failCount = 0;
  const token = jwt.sign({ u: 'owner' }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token });
});

/* ── 전체 데이터 조회 ── */
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
  db.updatedAt[key] = Date.now();
  saveDB();
  res.json({ ok: true, version: db.version });
});

/* ── 여러 키를 한 번에 저장 (최초 업로드 등) ── */
app.put('/api/state', auth, (req, res) => {
  const incoming = (req.body && req.body.data) || {};
  let changed = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (!STATE_KEYS.includes(key)) continue;
    db.state[key] = value;
    db.updatedAt[key] = Date.now();
    changed += 1;
  }
  if (changed) { db.version += 1; saveDB(); }
  res.json({ ok: true, changed, version: db.version });
});

/* ── 헬스 체크 (인증 불필요 — 프론트가 서버 존재 여부 확인용) ── */
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'household-budget', version: db.version }));

/* ═══════════════════════════════════════
   프론트엔드 정적 서빙
═══════════════════════════════════════ */
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'household-budget.html')));
app.get('/household-budget.html', (req, res) => res.sendFile(path.join(ROOT, 'household-budget.html')));

/* ═══════════════════════════════════════
   시작
═══════════════════════════════════════ */
loadDB();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  우리집 가계부 서버 실행 중`);
  console.log(`  ─ 이 컴퓨터:  http://localhost:${PORT}`);
  console.log(`  ─ 다른 컴퓨터: http://<이 컴퓨터의 IP>:${PORT}  (같은 와이파이/네트워크)`);
  console.log(`    예) http://192.168.0.10:${PORT}\n`);
  if (!process.env.PASSWORD) {
    console.warn(`  ⚠  접속 비밀번호가 기본값(budget1234)입니다. 바꾸려면:  PASSWORD=원하는비밀번호 npm start`);
  }
  if (!process.env.JWT_SECRET) {
    console.warn('  ⚠  JWT_SECRET 미지정: 서버를 재시작하면 각 기기에서 비밀번호를 다시 입력해야 합니다.');
    console.warn('     유지하려면:  JWT_SECRET=아무긴문자열 npm start\n');
  }
});
