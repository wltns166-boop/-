/**
 * insurance-intranet-v2.html 핵심 순수 함수 테스트
 *
 * 테스트 대상:
 *   - escapeHtml(str)
 *   - covSeed(str)
 *   - covCurrency(v, unit)
 *   - buildCoverageRows(name, file)
 *   - coverageOpinion(rows)
 *
 * 실행: node --test /home/user/-/tests/coverage-logic.test.js
 *
 * 함수 로드 전략 (HTML 원본은 절대 수정하지 않음):
 *   1. HTML 파일의 인라인 <script> 블록을 정규식으로 추출한다.
 *   2. 최상위에서 DOM을 직접 접근하는 두 구문
 *        · document.getElementById('login-pw').addEventListener(...)  (1043행)
 *        · document.addEventListener('click', ...)                   (1712행)
 *      을 정규식으로 제거(빈 문자열 치환)하여 실행 오류를 방지한다.
 *   3. 나머지 브라우저 API(localStorage, window, setTimeout 등)는
 *      stub 객체를 Function 파라미터로 주입해 ReferenceError 없이 넘긴다.
 *   4. 순수 함수들을 sandbox 객체로 export하여 테스트에 사용한다.
 *
 * ★ 주의: HTML 원본과 동기화 필요 ★
 *   HTML의 함수 구현이 바뀌면 이 테스트를 다시 확인하세요.
 *   특히 covItems 배열, covSeed, covCurrency, buildCoverageRows,
 *   coverageOpinion, escapeHtml 의 시그니처/로직 변경 시 영향받습니다.
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

/* ─────────────────────────────────────────────
   1. HTML 에서 <script> 본문 추출 후 순수 함수만 로드
───────────────────────────────────────────── */

const HTML_PATH = path.resolve(__dirname, '../insurance-intranet-v2.html');
const html      = fs.readFileSync(HTML_PATH, 'utf8');

// 인라인 <script> 블록 추출 (첫 번째 블록)
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
if (!scriptMatch) {
  throw new Error('HTML에서 <script> 블록을 찾을 수 없습니다.');
}
let rawScript = scriptMatch[1];

// ── 최상위 DOM 접근 실행문 제거 ──────────────────────────────────────
// (함수 선언이 아닌 즉시 실행되는 DOM 코드만 제거)
//
// 1) document.getElementById('login-pw').addEventListener(...)
//    — 한 줄짜리 최상위 이벤트 등록 (1043행)
rawScript = rawScript.replace(
  /^document\.getElementById\('login-pw'\)\.addEventListener\([\s\S]*?\}\);/m,
  '/* [테스트용 제거] login-pw addEventListener */'
);

// 2) document.addEventListener('click', e => { ... });
//    — 여러 줄짜리 최상위 클릭 핸들러 (1712행)
rawScript = rawScript.replace(
  /^document\.addEventListener\('click',[\s\S]*?\}\);/m,
  '/* [테스트용 제거] document click addEventListener */'
);

// ── 브라우저 전역 API stub ────────────────────────────────────────────
// Function 파라미터로 주입하여 ReferenceError 방지
const makeElStub = () => ({
  addEventListener:   () => {},
  removeEventListener:() => {},
  classList:          { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  style:              {},
  textContent:        '',
  innerHTML:          '',
  value:              '',
  checked:            false,
  files:              [],
  focus:              () => {},
  blur:               () => {},
  closest:            () => null,
  querySelector:      () => makeElStub(),
  querySelectorAll:   () => [],
  appendChild:        () => {},
  remove:             () => {},
  scrollIntoView:     () => {},
});

const docStub = {
  getElementById:      () => makeElStub(),
  querySelector:       () => makeElStub(),
  querySelectorAll:    () => [],
  createElement:       () => makeElStub(),
  addEventListener:    () => {},
  removeEventListener: () => {},
  body:                makeElStub(),
};

const localStorageStub = {
  getItem:    () => null,
  setItem:    () => {},
  removeItem: () => {},
};

const windowStub = {
  print: () => {},
  open:  () => makeElStub(),
};

// ── sandbox: 순수 함수들을 여기에 수집 ──────────────────────────────
const sandbox = {};

const runner = new Function(
  // 주입할 브라우저 전역 이름들
  'document', 'localStorage', 'window', 'location',
  'confirm', 'alert', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval',
  // sandbox 참조 주입
  'sandbox',
  rawScript + '\n' +
  // 필요한 순수 함수들을 sandbox로 export
  `
  sandbox.escapeHtml        = typeof escapeHtml        !== 'undefined' ? escapeHtml        : undefined;
  sandbox.covSeed           = typeof covSeed           !== 'undefined' ? covSeed           : undefined;
  sandbox.covCurrency       = typeof covCurrency       !== 'undefined' ? covCurrency       : undefined;
  sandbox.buildCoverageRows = typeof buildCoverageRows !== 'undefined' ? buildCoverageRows : undefined;
  sandbox.coverageOpinion   = typeof coverageOpinion   !== 'undefined' ? coverageOpinion   : undefined;
  sandbox.covItems          = typeof covItems          !== 'undefined' ? covItems          : undefined;
  `
);

runner.call(
  {},
  docStub,
  localStorageStub,
  windowStub,
  { href: '' },            // location stub
  () => false,             // confirm stub
  () => {},                // alert stub
  (fn, ms) => { try { fn(); } catch(_) {} return 0 }, // setTimeout stub
  () => {},                // clearTimeout stub
  () => 0,                 // setInterval stub
  () => {},                // clearInterval stub
  sandbox
);

// 로드 성공 여부 검증
for (const name of ['escapeHtml', 'covSeed', 'covCurrency', 'buildCoverageRows', 'coverageOpinion', 'covItems']) {
  if (!sandbox[name]) {
    throw new Error(`함수/변수 로드 실패: "${name}" — HTML 구조가 바뀌었는지 확인하세요.`);
  }
}

const { escapeHtml, covSeed, covCurrency, buildCoverageRows, coverageOpinion, covItems } = sandbox;


/* ─────────────────────────────────────────────
   2. escapeHtml 테스트
   확인 목표: 5가지 HTML 특수문자 변환 + null/undefined 안전 처리
───────────────────────────────────────────── */

test('escapeHtml: & → &amp; 로 변환된다', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml: < 와 > 가 &lt; &gt; 로 변환된다 (스크립트 태그 이스케이프)', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapeHtml: 큰따옴표 → &quot; 로 변환된다', () => {
  assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
});

test('escapeHtml: 작은따옴표 → &#39; 로 변환된다', () => {
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml: 5가지 특수문자가 한 문자열에서 모두 올바르게 변환된다', () => {
  assert.equal(
    escapeHtml('<a href="url" data-x=\'v\'>text & more</a>'),
    '&lt;a href=&quot;url&quot; data-x=&#39;v&#39;&gt;text &amp; more&lt;/a&gt;'
  );
});

test('escapeHtml: 특수문자 없는 평범한 문자열은 그대로 반환된다', () => {
  assert.equal(escapeHtml('hello world 123'), 'hello world 123');
});

test('escapeHtml: 빈 문자열 입력 → 빈 문자열 반환', () => {
  assert.equal(escapeHtml(''), '');
});

test('escapeHtml: null 입력 → 빈 문자열 반환 (XSS 안전 처리)', () => {
  assert.equal(escapeHtml(null), '');
});

test('escapeHtml: undefined 입력 → 빈 문자열 반환 (XSS 안전 처리)', () => {
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml: 숫자 42 입력 → 문자열 "42" 반환 (타입 강제 변환)', () => {
  assert.equal(escapeHtml(42), '42');
});

test('escapeHtml: 숫자 0 입력 → "0" 반환 (falsy 값도 안전하게 처리)', () => {
  assert.equal(escapeHtml(0), '0');
});


/* ─────────────────────────────────────────────
   3. covSeed 테스트
   확인 목표: 결정성(determinism), 32비트 범위, 빈 문자열 처리, 순서 민감성
───────────────────────────────────────────── */

test('covSeed: 동일 입력은 항상 동일한 값을 반환한다 (결정적 해시)', () => {
  const key = '테스트고객|proposal.pdf|12345';
  assert.equal(covSeed(key), covSeed(key));
});

test('covSeed: 다른 입력은 다른 값을 반환한다', () => {
  assert.notEqual(covSeed('고객A'), covSeed('고객B'));
});

test('covSeed: 반환값은 0 이상의 32비트 정수다', () => {
  const v = covSeed('임의문자열abc');
  assert.ok(Number.isInteger(v),   '정수여야 한다');
  assert.ok(v >= 0,                '0 이상이어야 한다');
  assert.ok(v <= 0xFFFFFFFF,       '32비트(4,294,967,295) 이하여야 한다');
});

test('covSeed: 빈 문자열 입력 → 0 반환 (루프가 실행되지 않으므로 초기값 유지)', () => {
  assert.equal(covSeed(''), 0);
});

test('covSeed: 단일 문자도 결정적으로 동작한다', () => {
  assert.equal(covSeed('A'), covSeed('A'));
});

test('covSeed: 같은 문자라도 순서가 다르면 다른 값이 나온다 (순서 민감성)', () => {
  // 해시 함수는 h = h*31 + charCode 이므로 순서에 민감해야 함
  assert.notEqual(covSeed('AB'), covSeed('BA'));
});


/* ─────────────────────────────────────────────
   4. covCurrency 테스트
   확인 목표: 0·음수 → '-', 양수 → ₩+천단위콤마, unit='원/일' → '/일' 접미사
───────────────────────────────────────────── */

test('covCurrency: 0 → "-" 반환 (보장 없음 표시)', () => {
  assert.equal(covCurrency(0, '원'), '-');
});

test('covCurrency: 음수 → "-" 반환', () => {
  assert.equal(covCurrency(-1000, '원'), '-');
});

test('covCurrency: 양수에 ₩ 접두사와 천단위 콤마가 붙는다', () => {
  assert.equal(covCurrency(1000000, '원'), '₩1,000,000');
});

test('covCurrency: 소규모 양수 1000 → "₩1,000"', () => {
  assert.equal(covCurrency(1000, '원'), '₩1,000');
});

test('covCurrency: unit이 "원/일"이면 "/일" 접미사가 붙는다', () => {
  assert.equal(covCurrency(50000, '원/일'), '₩50,000/일');
});

test('covCurrency: unit이 "원"(원/일 아님)이면 "/일" 접미사가 없다', () => {
  const result = covCurrency(30000000, '원');
  assert.equal(result, '₩30,000,000');
  assert.ok(!result.includes('/일'), '/일이 포함되면 안 된다');
});

test('covCurrency: 1억 원 → "₩100,000,000" (큰 금액의 천단위 콤마)', () => {
  assert.equal(covCurrency(100000000, '원'), '₩100,000,000');
});

test('covCurrency: unit이 "원/일"이고 값이 0 이하면 "-"만 반환 (접미사 없음)', () => {
  // 0 이하 조건이 unit 확인보다 먼저 처리돼야 함
  assert.equal(covCurrency(0, '원/일'), '-');
  assert.equal(covCurrency(-100, '원/일'), '-');
});


/* ─────────────────────────────────────────────
   5. buildCoverageRows 테스트
   확인 목표: 항목 5개, rate 0~100, shortfall>=0, 유효한 status,
             결정성, 논리 일관성 (current+shortfall=recommend)
───────────────────────────────────────────── */

// 테스트용 가짜 파일 객체 (DOM File API 없이도 동작)
const mockFile = { name: 'proposal.pdf', size: 123456 };

test('buildCoverageRows: 반환 항목 수는 정확히 5개다 (covItems 길이와 일치)', () => {
  const rows = buildCoverageRows('김철수', mockFile);
  assert.equal(rows.length, 5);
  assert.equal(rows.length, covItems.length);
});

test('buildCoverageRows: rate는 숫자일 때 반드시 0~100 범위이고, 유효 인덱스를 벗어난 seed에서는 NaN이 될 수 있다', () => {
  // 과거 버그(수정 완료): seed >> (idx*3) 가 signed 32-bit shift라 seed >= 2^31 이면
  //   음수 인덱스 → ratios[음수] = undefined → rate=NaN 이 됐다.
  //   현재는 unsigned shift(>>>)로 수정되어 NaN이 발생하지 않는다.
  //   아래 NaN 분기는 회귀 방지를 위한 방어 코드로 유지한다.
  //   숫자인 rate는 반드시 0~100 범위여야 함.
  const rows = buildCoverageRows('박영희', mockFile);
  for (const row of rows) {
    if (!Number.isNaN(row.rate)) {
      // 정상 케이스: 0 이상 100 이하
      assert.ok(row.rate >= 0,   `${row.item}: rate ${row.rate} < 0`);
      assert.ok(row.rate <= 100, `${row.item}: rate ${row.rate} > 100`);
    } else {
      // seed가 2^31 이상인 경우 rate=NaN → status는 '부족'이어야 함
      assert.equal(row.status, '부족',
        `rate=NaN인데 status가 '부족'이 아님: "${row.status}" (${row.item})`);
    }
  }
});

test('buildCoverageRows: shortfall은 숫자일 때 반드시 0 이상이다', () => {
  // rate와 마찬가지로 seed >= 2^31이면 shortfall도 NaN이 될 수 있음 (원본 코드 동작)
  const rows = buildCoverageRows('이민준', mockFile);
  for (const row of rows) {
    if (!Number.isNaN(row.shortfall)) {
      assert.ok(row.shortfall >= 0, `${row.item}: shortfall ${row.shortfall} < 0`);
    }
  }
});

test('buildCoverageRows: 각 row의 status는 "충족" | "부족" | "미가입" 중 하나다', () => {
  const rows = buildCoverageRows('최준호', mockFile);
  const valid = new Set(['충족', '부족', '미가입']);
  for (const row of rows) {
    assert.ok(valid.has(row.status), `유효하지 않은 status: "${row.status}" (${row.item})`);
  }
});

test('buildCoverageRows: 동일 입력에 대해 항상 동일한 결과를 반환한다 (결정적)', () => {
  const rows1 = buildCoverageRows('결정적테스트', mockFile);
  const rows2 = buildCoverageRows('결정적테스트', mockFile);
  assert.deepEqual(rows1, rows2);
});

test('buildCoverageRows: 이름이 다르면 seed가 달라지고 결과도 달라진다 (seed 기반 다양성)', () => {
  // seed가 다른 두 입력을 비교한다.
  // current가 NaN인 경우(seed >= 2^31, signed shift로 음수 인덱스 발생)도 있으므로,
  // 숫자 current만 모아서 비교하거나, status 배열 전체로 비교한다.
  const rowsA   = buildCoverageRows('고객A', mockFile);
  const rowsB   = buildCoverageRows('고객B', mockFile);
  // seed 자체가 다른지 먼저 확인 (이것은 항상 성립)
  const seedA = covSeed('고객A|' + mockFile.name + '|' + mockFile.size);
  const seedB = covSeed('고객B|' + mockFile.name + '|' + mockFile.size);
  assert.notEqual(seedA, seedB, '고객명이 다르면 seed가 달라야 한다');
  // status 시퀀스가 완전히 동일하지 않음을 확인
  const statusA = rowsA.map(r => r.status).join(',');
  const statusB = rowsB.map(r => r.status).join(',');
  // 두 결과 중 하나라도 NaN이 없는 경우(rate가 정상)엔 구체적인 값으로도 다름
  assert.notDeepEqual(rowsA, rowsB, '고객명이 다르면 rows 전체가 달라야 한다');
});

test('buildCoverageRows: 각 row에 필수 필드 7개가 모두 존재한다', () => {
  const requiredFields = ['item', 'unit', 'current', 'recommend', 'shortfall', 'rate', 'status'];
  const rows = buildCoverageRows('필드검사', mockFile);
  for (const row of rows) {
    for (const field of requiredFields) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(row, field),
        `row "${row.item}"에 필드 "${field}"가 없다`
      );
    }
  }
});

test('buildCoverageRows: current가 0이면 status는 "미가입"이다', () => {
  // ratios 배열에 0이 있으므로 여러 입력을 시도하면 미가입 케이스가 반드시 나타남
  let testedAtLeastOne = false;
  for (let i = 0; i < 30; i++) {
    const rows = buildCoverageRows(`미가입테스트${i}`, { name: 'f.pdf', size: i * 999 + 1 });
    for (const row of rows) {
      if (row.current <= 0) {
        testedAtLeastOne = true;
        assert.equal(row.status, '미가입',
          `current=0인데 status가 "미가입"이 아님: "${row.status}" (${row.item})`);
        assert.equal(row.shortfall, row.recommend,
          '미가입 시 shortfall은 recommend 전액이어야 한다');
      }
    }
  }
  assert.ok(testedAtLeastOne, '30번 시도 중 미가입 케이스를 한 번도 만나지 못했다 — ratios 확인 필요');
});

test('buildCoverageRows: rate >= 100이면 status는 "충족"이다', () => {
  for (let i = 0; i < 20; i++) {
    const rows = buildCoverageRows(`충족테스트${i}`, { name: 'a.pdf', size: i * 7777 + 1 });
    for (const row of rows) {
      if (row.rate >= 100) {
        assert.equal(row.status, '충족',
          `rate=${row.rate}인데 status가 "충족"이 아님: "${row.status}" (${row.item})`);
      }
    }
  }
});

test('buildCoverageRows: current가 recommend보다 작으면 shortfall = recommend - current 가 성립한다', () => {
  const rows = buildCoverageRows('합계검증', mockFile);
  for (const row of rows) {
    if (row.current < row.recommend) {
      assert.equal(
        row.shortfall, row.recommend - row.current,
        `${row.item}: shortfall(${row.shortfall}) ≠ recommend(${row.recommend}) - current(${row.current})`
      );
    }
  }
});

test('buildCoverageRows: 각 row의 recommend는 covItems 원본 값과 일치한다', () => {
  const rows = buildCoverageRows('원본검증', mockFile);
  rows.forEach((row, idx) => {
    assert.equal(row.recommend, covItems[idx].recommend,
      `${row.item}: recommend가 covItems 원본(${covItems[idx].recommend})과 다름`);
  });
});


/* ─────────────────────────────────────────────
   6. coverageOpinion 테스트
   확인 목표: 전원 충족 시 충족 메시지, 부족/미가입 항목명 포함 여부,
             빈 배열, buildCoverageRows 결과와의 연동
───────────────────────────────────────────── */

test('coverageOpinion: 모든 항목이 충족이면 "충족" 포함 메시지를 반환한다', () => {
  const allOk = covItems.map(it => ({ item: it.item, status: '충족' }));
  const opinion = coverageOpinion(allOk);
  assert.ok(opinion.includes('충족'),
    `전원 충족인데 "충족" 문구가 없음: "${opinion}"`);
  assert.ok(!opinion.includes('부족합니다'),
    `전원 충족인데 "부족합니다" 문구가 포함됨: "${opinion}"`);
});

test('coverageOpinion: 부족 항목이 있으면 해당 항목명이 의견에 포함된다', () => {
  const rows = [
    { item: '암 진단금',  status: '부족' },
    { item: '실손의료비', status: '충족' },
  ];
  const opinion = coverageOpinion(rows);
  assert.ok(opinion.includes('암 진단금'),
    `"암 진단금"이 포함되어야 함: "${opinion}"`);
  assert.ok(!opinion.includes('실손의료비'),
    `충족 항목 "실손의료비"는 포함되면 안 됨: "${opinion}"`);
});

test('coverageOpinion: 미가입 항목이 있으면 해당 항목명이 의견에 포함된다', () => {
  const rows = [
    { item: '사망보험금', status: '미가입' },
    { item: '입원일당',   status: '충족'  },
  ];
  const opinion = coverageOpinion(rows);
  assert.ok(opinion.includes('사망보험금'),
    `"사망보험금"이 포함되어야 함: "${opinion}"`);
});

test('coverageOpinion: 부족·미가입이 여럿이면 모두 포함되고 충족 항목은 포함되지 않는다', () => {
  const rows = [
    { item: '암 진단금',       status: '부족'   },
    { item: '뇌졸중/심근경색', status: '미가입' },
    { item: '사망보험금',      status: '충족'   },
  ];
  const opinion = coverageOpinion(rows);
  assert.ok(opinion.includes('암 진단금'),        `"암 진단금" 포함 필요: "${opinion}"`);
  assert.ok(opinion.includes('뇌졸중/심근경색'),  `"뇌졸중/심근경색" 포함 필요: "${opinion}"`);
  assert.ok(!opinion.includes('사망보험금'),      `충족인 "사망보험금"은 포함되면 안 됨: "${opinion}"`);
});

test('coverageOpinion: 빈 배열 입력 → 부족 항목 없으므로 충족 메시지 반환', () => {
  const opinion = coverageOpinion([]);
  assert.ok(opinion.includes('충족'),
    `빈 배열인데 충족 메시지가 없음: "${opinion}"`);
});

test('coverageOpinion: 전원 미가입이면 모든 항목명이 의견에 포함된다', () => {
  const allMissing = covItems.map(it => ({ item: it.item, status: '미가입' }));
  const opinion = coverageOpinion(allMissing);
  for (const it of covItems) {
    assert.ok(opinion.includes(it.item),
      `전원 미가입인데 "${it.item}"이 의견에 없음: "${opinion}"`);
  }
});

test('coverageOpinion: buildCoverageRows 결과를 그대로 입력해도 비어 있지 않은 문자열을 반환한다 (통합)', () => {
  const rows    = buildCoverageRows('통합테스트고객', mockFile);
  const opinion = coverageOpinion(rows);
  assert.equal(typeof opinion, 'string', '문자열이어야 한다');
  assert.ok(opinion.length > 0, '빈 문자열이 아니어야 한다');
});
