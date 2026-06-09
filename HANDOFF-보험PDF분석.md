# 인수인계: surinsur.com 기능 이식 (보험 PDF 분석)

> 작업 브랜치: `claude/keen-hawking-7n9mxg`
> 대상 파일: `insurance-intranet-v2.html` (단일 HTML, 인라인 CSS/JS)

---

## 1. 사용자 요청

surinsur.com 에 있는 기능들을 사장님 인트라넷(`insurance-intranet-v2.html`)에 넣고 싶음.

- surinsur.com 은 **자동 접근 차단(403)** → 사이트 HTML/JS 를 직접 가져올 수 없음.
- 사용자가 **페이지 소스 스크린샷**을 제공해서 구조는 파악됨 (아래 2번).
- 사용자가 진행 방식으로 **"구조 보고 새로 만들어줘"** 를 선택함.
  → 원본 코드 복사가 아니라, 같은 동작 흐름을 **새로 구현**하는 방향.

---

## 2. surinsur.com 정체 (소스 스크린샷 분석)

보험 **보장분석 + PDF 추출** 도구. 스크립트 구성:

| 모듈 | 기능 |
|------|------|
| `pdf_extractor.js` | 보험 증권/약관 PDF에서 데이터 자동 추출 |
| `samsung_analyzer.js` + `samsung_config.js` | 삼성 보장분석 |
| `db_analyzer.js` + `db_config.js` | DB손해보험 보장분석 |
| `heungkuk_analyzer.js` + `heungkuk_config.js` | 흥국 보장분석 |
| `mirae_analyzer.js` + `mirae_config.js` | 미래에셋 보장분석 |
| `supabase.js` + Supabase SDK | 클라우드 DB 저장/조회 |
| `expert_data.js`, `managers.js` | 전문가/담당자 데이터 (Base64) |
| `ui_renderer.js`, `main.js` | 화면 렌더링 / 메인 로직 |
| About 모달, Insight 모달 | 안내·인사이트 팝업 |

핵심 흐름: **보험사 선택 → PDF 업로드 → 텍스트 추출 → 보험사별 보장분석 → 보장분석표 생성/저장 → 인사이트**

> ⚠️ 실제 analyzer 로직 / expert 데이터 / Supabase 키는 모두 403 으로 못 가져옴 → 재구현은 휴리스틱(키워드 매칭) 기반이며 "자동 추정, 검토 필요"로 표시할 것.

---

## 3. 기존 인트라넷 구조/컨벤션 (중요 — 그대로 따를 것)

### 페이지 패턴
- 사이드바: `<div class="nav-item" onclick="goPage('ID',this)">...`
- 페이지: `<div class="page" id="page-ID">` (active 클래스로 전환)
- `goPage(id, el)` 가 `.page`/`.nav-item` 의 active 토글 (line ~975)

### localStorage 헬퍼 (접두사 `in_`)
```js
ls(key, def)      // 읽기: localStorage 'in_'+key, 없으면 def
lsSet(key, val)   // 쓰기
today()           // 'YYYY-MM-DD'
```
(정의: `ls/lsSet` line 779, `today()` line 1843)

### UI 헬퍼
- `showToast(type, title, msg)` — type: success/info/warning/danger (line 1442)
- `addNotif(type, title, msg)` (line 1389)
- `exportPDF(pageId, filename)` — 새 창 열어 인쇄 (line 1583)
- `toggleForm(id)` — 폼 show/hide (line 986)

### 재사용 CSS 클래스
`card`, `card-title`, `btn btn-primary/btn-secondary/btn-danger/btn-sm`, `btn-group`,
`form-row col2/col3`, `form-group`(label+input), `tbl-wrap`+`table`,
`tag tag-green/tag-yellow/tag-red/tag-blue/tag-gray`, `progress-bar`>`progress-fill`,
`grid-2/grid-3/grid-4`, `stat-card`, `flex gap8 mb16/mb20`, `no-print`

### 전역 검색 등록 (line ~1466, `searchable` 배열)
새 페이지 추가 시 한 줄 추가:
```js
{ type:'페이지', icon:'🤖', name:'보험 PDF 분석', page:'analyzer' },
```

### initApp 렌더 호출부 (line ~945)
`renderNotices(); renderCustomers(); ...` 줄에 `renderAnalysisList();` 추가.

### 기존 보장분석표(`page-coverage`, line 597)
정적 하드코딩 예시 표. 새 기능은 별도 페이지 `page-analyzer` 로 만들고, 이쪽과 같은 표 형식(보장항목/현재/권장/부족액/충족률/상태) 재사용.

---

## 4. 진행 상황

### ✅ 완료
- 사이드바에 메뉴 추가됨 (`보장분석표` 아래):
  ```html
  <div class="nav-item" onclick="goPage('analyzer',this)"><span class="icon">🤖</span> 보험 PDF 분석 <span class="nbadge" style="background:var(--accent)">AI</span></div>
  ```
  ⚠️ **현재 이 메뉴를 누르면 `page-analyzer` 가 없어서 에러남** → 아래 5번 페이지/JS 추가 전까지 미완성 상태.

### ⬜ 남음 = 아래 5번 전체

---

## 5. 남은 작업 (구현 계획)

### (A) 페이지 HTML 추가 — 관리자 페이지 `</div>`(line ~733) 와 `</main>`(line ~735) 사이
`<div class="page" id="page-analyzer">` 구성:
1. **Step1 카드**: 보험사 select(삼성/DB/흥국/미래에셋/기타) + 고객명 input + PDF 파일 업로드(`<input type=file accept=.pdf>`) + 텍스트 직접 붙여넣기 textarea(폴백) + `[자동 분석]` 버튼
2. **추출 상태/원문 미리보기** 영역 (id 컨테이너)
3. **Step2 결과 카드**: 보장분석표 렌더 컨테이너(`#analyzer-result`) — 현재보장 금액 편집 가능
4. **종합의견(인사이트)** 박스 + `[인사이트 보기]`(모달) + `[분석 저장]` 버튼
5. **저장된 분석 목록** 표(`#analysis-list-table`): 고객명/보험사/충족률/날짜/[불러오기][삭제]

### (B) pdf.js CDN 로드 — 인라인 `<script>`(line 765) **앞**에 추가
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
```
초기화 시 `pdfjsLib.GlobalWorkerOptions.workerSrc = '.../pdf.worker.min.js'`.
⚠️ **네트워크 정책상 CDN 차단 가능** → pdf.js 없으면 파일 업로드는 막고 "텍스트 붙여넣기" 폴백으로 동작하도록 가드 처리.

### (C) 인라인 JS 추가 — `today()`(line 1843) 뒤, `</script>`(1847) 앞

설계:
```js
// 보장 항목 표준 분류 + 권장보장액
const COVERAGE_ITEMS = [
  {key:'death',  label:'사망보험금',     rec:100000000, unit:'원', kw:['사망보험금','일반사망','사망시']},
  {key:'cancer', label:'암진단금',       rec:30000000,  unit:'원', kw:['암진단','악성신생물','암보장']},
  {key:'brain',  label:'뇌졸중/뇌출혈',  rec:20000000,  unit:'원', kw:['뇌졸중','뇌출혈','뇌혈관']},
  {key:'heart',  label:'급성심근경색',   rec:20000000,  unit:'원', kw:['심근경색','허혈성심장']},
  {key:'silson', label:'실손의료비',     rec:50000000,  unit:'원', kw:['실손','입원의료비']},
  {key:'hospday',label:'입원일당',       rec:50000,     unit:'원/일', kw:['입원일당','입원급여']},
  {key:'surgery',label:'수술비',         rec:5000000,   unit:'원', kw:['수술비','수술급여']},
  {key:'disab',  label:'후유장해',       rec:100000000, unit:'원', kw:['후유장해','장해']},
];

// 보험사별 config (구조 = surinsur 의 *_config.js 역할)
// 회사별 키워드 별칭만 다르게, 분석 로직은 공유
const ANALYZER_CONFIG = {
  samsung:  {name:'삼성',     color:'#1e5ef3', alias:{/* itemKey: [추가키워드] */}},
  db:       {name:'DB손해보험', color:'#10b981', alias:{}},
  heungkuk: {name:'흥국',     color:'#f59e0b', alias:{}},
  mirae:    {name:'미래에셋',  color:'#8b5cf6', alias:{}},
  etc:      {name:'기타',     color:'#6b7a99', alias:{}},
};

// 한글 금액 파서: "5,000만원" / "1억" / "50,000,000원" → 숫자
function parseKoreanAmount(s){ /* 억/만원/원/콤마 처리 */ }

// 키워드 주변에서 금액 추출 (휴리스틱)
function extractAmount(text, keywords){ /* 키워드 매치 후 뒤 ~60자에서 금액 토큰 탐색 */ }

async function extractPdfText(file){ /* pdf.js 로 page별 textContent 합치기 */ }

function runAnalysis(){ /* 보험사 config + 추출텍스트 → 항목별 현재/권장/부족/충족률 → renderAnalyzerResult */ }
function renderAnalyzerResult(items, cust, insurer){ /* coverage 표 형식 + 충족률 progress + tag */ }
function buildInsight(items){ /* 부족 항목 모아 종합의견 문자열 */ }

function saveAnalysis(){ /* ls('analyses',[]) 에 push, lsSet, showToast, renderAnalysisList */ }
function renderAnalysisList(){ /* #analysis-list-table 렌더 (불러오기/삭제) */ }
function loadAnalysis(id){ } 
function deleteAnalysis(id){ }
```
저장 데이터 키: `ls('analyses', [])` (Supabase 대체 = localStorage).

### (D) searchable 배열에 한 줄 추가 (line ~1473 근처)
### (E) initApp 렌더 호출부에 `renderAnalysisList();` 추가 (line ~956 근처)

---

## 6. 주의사항 / 결정 기록
- **휴리스틱 한계**: PDF 양식이 회사마다 달라 금액 자동추출은 부정확할 수 있음 → 결과표는 **수정 가능**하게, "자동 추정값 · 검토 필요" 문구 표시.
- **CDN 차단 가능성**: pdf.js 안 뜨면 파일 업로드 비활성 + 텍스트 붙여넣기 폴백.
- **단일 HTML 유지**: 빌드 도구 없음. 모든 코드는 이 파일 안 인라인으로.
- **PR 만들지 말 것** (사용자가 명시 요청 시에만). 작업은 위 브랜치에 커밋/푸시.
- 커밋 후 한 줄 메뉴가 동작하려면 5번(A~E)이 모두 들어가야 함. 부분 커밋 시 메뉴 클릭이 에러날 수 있음을 인지.

---

## 7. 빠른 시작 (다음 세션)
1. 이 문서 + `insurance-intranet-v2.html` 읽기
2. 5번 (A)~(E) 순서로 편집
3. 브라우저로 파일 열어 로그인 → "보험 PDF 분석" 메뉴 → 텍스트 붙여넣기로 분석 동작 확인
4. `claude/keen-hawking-7n9mxg` 에 커밋/푸시
