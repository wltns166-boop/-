// 처방조제 정리 시험 — 사용자 제공 스크린샷(9행)을 추출 에이전트 출력(JSON)으로 재현
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { summarizePrescriptions, formatPrescriptionLines } = require('./prescription-summarize.js');

// [시험 1] 스크린샷 표 그대로 — 추출 에이전트가 옮긴 결과 (계산·중복제거 없이 9행 전부)
const rows = [
  {date:'2026-01-19', place:'서울연합의원',  kind:'외래',    drug:'펠루비에스정(펠루비프로펜트로메타민)', ingredient:'pelubiprofen tromethamine', days:7},
  {date:'2026-01-19', place:'봉명피보약국',  kind:'처방조제', drug:'코대원에스시럽',                     ingredient:'ammonium chloride',          days:7},
  {date:'2026-01-19', place:'봉명피보약국',  kind:'처방조제', drug:'메솔론정(메틸프레드니솔론)',          ingredient:'methylprednisolone',         days:7},
  {date:'2026-01-19', place:'서울연합의원',  kind:'외래',    drug:'코대원에스시럽',                     ingredient:'ammonium chloride',          days:7},
  {date:'2026-01-19', place:'서울연합의원',  kind:'외래',    drug:'알씨텍정5mg(염산레보세티리진)',        ingredient:'levocetirizine dihydrochloride', days:7},
  {date:'2026-01-19', place:'서울연합의원',  kind:'외래',    drug:'휴온스클로르페니라민말레산염주사액',    ingredient:'chlorpheniramine maleate',   days:1},   // 주사 1일
  {date:'2026-01-19', place:'봉명피보약국',  kind:'처방조제', drug:'동광레바미피드정',                    ingredient:'rebamipide',                 days:7},
  {date:'2026-01-19', place:'서울연합의원',  kind:'외래',    drug:'동광레바미피드정',                    ingredient:'rebamipide',                 days:7},
  {date:'2026-01-19', place:'봉명피보약국',  kind:'처방조제', drug:'알씨텍정5mg(염산레보세티리진)',        ingredient:'levocetirizine dihydrochloride', days:7},
];
const s1 = summarizePrescriptions(rows);
console.log('=== 시험 1: 스크린샷 9행 ===');
formatPrescriptionLines(s1).forEach(l=>console.log(l));
const expect1 = ['2026년1월19일 / 봉명피보약국 / 약처방 : 7일', '2026년1월19일 / 서울연합의원 / 약처방 : 7일'];
const got1 = formatPrescriptionLines(s1);
console.log('기대값 일치:', JSON.stringify(got1)===JSON.stringify(expect1) ? '✅' : '❌ '+JSON.stringify(got1));

// [시험 2] 엣지 케이스 — 여러 날짜, 장기 처방, 값 누락, 완전 중복 행
const rows2 = [
  {date:'2025-11-03', place:'청주삼성내과', kind:'외래',    drug:'텔미사르탄정', ingredient:'telmisartan', days:30},
  {date:'2025-11-03', place:'청주삼성내과', kind:'외래',    drug:'텔미사르탄정', ingredient:'telmisartan', days:30},  // 완전 중복 행 → 1회
  {date:'2025-11-03', place:'온누리약국',   kind:'처방조제', drug:'텔미사르탄정', ingredient:'telmisartan', days:30},
  {date:'2025-12-01', place:'청주삼성내과', kind:'외래',    drug:'텔미사르탄정', ingredient:'telmisartan', days:60},
  {date:'2025-12-01', place:'청주삼성내과', kind:'외래',    drug:'아스피린장용정', ingredient:'aspirin', days:null},  // 일수 누락 → 0 취급, 최대값에 영향 없음
];
console.log('\n=== 시험 2: 여러 날짜·중복·누락 ===');
formatPrescriptionLines(summarizePrescriptions(rows2)).forEach(l=>console.log(l));
// 기대: 11/3 청주삼성내과 30일, 11/3 온누리약국 30일, 12/1 청주삼성내과 60일 (중복행 무시, null 무해)

// [시험 3] 30일 이상 복용 판정 — 확정 규칙: 기록된 총일수 그대로, 합산 없음
const { flagLongPrescriptions } = require('./prescription-summarize.js');
console.log('\n=== 시험 3: 30일 이상 복용 판정 ===');
const f1 = flagLongPrescriptions(summarizePrescriptions(rows));   // 전부 7일 → 없음
console.log('시험1 데이터(전부 7일):', f1.length===0 ? '해당 없음 ✅' : '❌ '+JSON.stringify(f1));
const f2 = flagLongPrescriptions(summarizePrescriptions(rows2));  // 30,30,60 → 3건
console.log('시험2 데이터(30·30·60일):', f2.length===3 ? '3건 해당 ✅' : '❌');
formatPrescriptionLines(f2).forEach(l=>console.log('  →', l));
const f3 = flagLongPrescriptions(summarizePrescriptions([
  {date:'2025-01-05', place:'A내과', drug:'약', days:28},
  {date:'2025-02-05', place:'A내과', drug:'약', days:28},   // 28+28=56이지만 합산 안 함 → 미해당
]));
console.log('28일 처방 2회(합산 안 함):', f3.length===0 ? '해당 없음 ✅ (확정 규칙대로)' : '❌');
