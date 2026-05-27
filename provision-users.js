/**
 * TEAM TOPS — Firebase 인증 계정 생성 + 평문 비밀번호 제거 스크립트
 *
 * 무엇을 하나요?
 *   1) Firestore(tops/data)의 팀원 목록(mem) + 관리자(0001~0003)에 대해
 *      Firebase Authentication 계정을 만듭니다. (이메일 = 아이디@team-tops.local)
 *   2) 각 계정에 임시 비밀번호를 설정하고, passwords.csv 로 출력합니다.
 *      → 팀원에게 임시 비밀번호를 알려주고, 첫 로그인 후 "비밀번호 변경"하게 하세요.
 *   3) Firestore에 평문으로 저장돼 있던 비밀번호(lpw)를 삭제합니다.
 *
 * 준비물:
 *   - Node.js
 *   - Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성"
 *     → 내려받은 JSON 을 이 파일과 같은 폴더에 serviceAccount.json 으로 저장
 *
 * 실행:
 *   npm install firebase-admin
 *   node provision-users.js
 *
 * 주의: 한 번 실행하면 모든 계정의 비밀번호가 임시값으로 바뀝니다(이미 유출된 값이라 교체 필요).
 */

const fs = require('fs');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

const EMAIL_DOMAIN = '@team-tops.local';
const ADMIN_IDS = ['0001', '0002', '0003'];

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

function tempPassword() {
  // 8자리 임시 비밀번호 (영문 대/소 + 숫자)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function upsertUser(id, password) {
  const email = id + EMAIL_DOMAIN;
  let existing = null;
  try { existing = await auth.getUserByEmail(email); } catch (e) { /* 없음 */ }
  if (existing) {
    await auth.updateUser(existing.uid, { password });
    return 'updated';
  } else {
    await auth.createUser({ uid: id, email, password });
    return 'created';
  }
}

(async () => {
  const ref = db.collection('tops').doc('data');
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  const mem = Array.isArray(data.mem) ? data.mem : [];

  // 처리할 아이디 목록 (팀원 + 관리자), 중복 제거
  const ids = new Set(ADMIN_IDS);
  mem.forEach((m) => { if (m && m.lid) ids.add(String(m.lid)); });

  const rows = [['아이디', '이름', '임시비밀번호', '결과']];
  for (const id of ids) {
    const m = mem.find((x) => String(x.lid) === String(id));
    const name = (m && m.name) || (ADMIN_IDS.includes(id) ? '(관리자)' : '');
    const pw = tempPassword();
    try {
      const result = await upsertUser(id, pw);
      rows.push([id, name, pw, result]);
      console.log(`${result.padEnd(7)} ${id} ${name}`);
    } catch (e) {
      rows.push([id, name, '', 'FAIL: ' + e.message]);
      console.warn(`FAIL    ${id} ${name} — ${e.message}`);
    }
  }

  // 평문 비밀번호(lpw) 제거 후 저장
  const cleanMem = mem.map((m) => {
    const c = Object.assign({}, m);
    delete c.lpw;
    return c;
  });
  await ref.set({ mem: cleanMem }, { merge: true });
  console.log('\n✅ Firestore에서 평문 비밀번호(lpw) 제거 완료.');

  // CSV 출력
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync('passwords.csv', '﻿' + csv, 'utf8'); // BOM: 엑셀 한글 깨짐 방지
  console.log('✅ 임시 비밀번호 목록을 passwords.csv 에 저장했습니다.');
  console.log('   → 팀원에게 임시 비밀번호를 안전하게 전달하고, 첫 로그인 후 변경하도록 안내하세요.');
  console.log('   → passwords.csv 는 전달 후 반드시 삭제하세요.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
