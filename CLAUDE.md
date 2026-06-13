# TEAM TOPS 보험대리점 인트라넷 — 작업 노트 (CLAUDE.md)

> 이 파일은 **새 작업/새 세션을 시작할 때 가장 먼저 읽는 기준 문서**입니다.
> 같은 실수가 반복되지 않도록, 이 프로젝트의 구조·함정·규칙을 정리해 둡니다.
> 새로운 함정을 발견하거나 규칙이 생기면 여기 계속 추가하세요.

---

## 1. 프로젝트 개요

- **메인 파일**: `index.html` — 단일 HTML 인트라넷 앱 (HTML+CSS+JS 한 파일, 약 11,000줄)
- **구글드라이브 연동 서버**: `google-drive-sync.gs` — Apps Script 웹앱
- **데이터 저장**: `localStorage` + Firebase(Firestore) 동기화. 파일/이미지/PDF는 Firebase Storage + 구글드라이브.
- 작업 브랜치: `claude/admiring-fermi-1by3Z`
- 대화·주석은 **한국어**로.

---

## 2. ⚠️ 반복됐던 함정 — 새 코드 짤 때 반드시 확인

### 함정 A — 목록 항목을 "배열 인덱스(ni/idx)"로 찾지 말 것
정렬·필터된 화면에서 `onclick="fn('+ni+')"` 로 **표시 순서 인덱스**를 넘기고,
핸들러가 그 인덱스로 **정렬 안 된 원본 배열**을 다시 인덱싱하면 **엉뚱한 항목이 처리**된다.
(실제로 알림발송·전체완료·특이사항·삭제·청구파일에서 연쇄로 터졌음)

- **규칙**: 핸들러에는 **고유 식별자(고객명/이름/ID)** 를 넘긴다.
  - 문자열은 `('fn('+JSON.stringify(name)+')').replace(/"/g,'&quot;')` 로 onclick에 안전하게 심는다.
  - data 속성은 `data-name="'+_alertEsc(name)+'"` 로 넣고 `getAttribute('data-name')` 로 읽는다.
- **예외(안전)**: 원본 배열을 **정렬·필터 없이 그대로** 그리거나(`_exRows`, biz `prospects/recruits`, `exams`),
  렌더 시 `{c:c, i:원본인덱스}` 처럼 **원본 인덱스를 명시적으로 보존**해 넘기면(공지 `not`, 청구 `claims`, dbEx `_dbExDisplayList`) 안전하다.
- 새 목록 핸들러를 만들면 **"이 인덱스가 정렬/필터 뒤에도 원본과 일치하나?"** 를 반드시 자문할 것.

### 함정 B — localStorage에 큰 데이터(base64) 직접 저장 금지 / 저장은 항상 try-catch
용량 초과(QuotaExceeded)가 나면 **그 줄에서 예외가 터져 이후 로직(클라우드 저장·화면 갱신)이 통째로 중단**된다.
이게 "저장 안 됨 / 현황에 안 뜸 / 무한 재생성" 증상의 공통 원인이었다.

- **규칙 1**: 직접 `localStorage.setItem(...)` 쓰지 말고 **`_lsSet(key, value)`** 헬퍼를 쓴다 (내부 try/catch).
- **규칙 2**: 이미지·PDF·오디오 같은 **base64는 localStorage에 넣지 않는다.**
  원본은 **Firebase Storage(URL) / Firestore / 메모리**에 두고, localStorage엔 **메타데이터만**.
  - `sv()` 는 `_slimForStorage(key, v)` 로 무거운 base64를 자동 제거해 캐시한다
    (대상: 공지 첨부 `tops_not`, 통화 음성 `tops_dbs`, 사업계획서 첨부 `tops_bizplan`).
  - 청구(claims)는 전용 헬퍼 사용: 저장 `_persistClaims()`, 재로드 `_reloadClaims()`.

### 함정 C — `claims`/배열을 localStorage에서 다시 읽으면 메모리의 큰 데이터가 날아감
함수 시작에서 `claims=JSON.parse(localStorage.getItem('tops_claims'))` 처럼 통째로 재로드하면,
**메모리에만 있던 생성 PDF·이미지·공유 URL**(quota로 로컬 미저장)이 사라져 "방금 만든 게 없어짐"이 된다.

- **규칙**: claims 재로드는 **`_reloadClaims()`** 만 사용 (메모리의 packagePDFs/pkgUrls/이미지/서명 보존).
  claims 저장은 **`_persistClaims()`** 만 사용 (로컬엔 PDF 제외, Firestore엔 이미지·서명까지 제외).

### 함정 D — 어두운 모달 테마에 검은 글씨를 넣으면 안 보임
공용 모달(`.mo`)은 배경이 어둡고(`rgba(1,6,26,.99)`) 글씨가 옅은 색(`.fi` = `#b8c0e0`).
밝은 내용/검은 글씨가 필요한 모달·입력칸은 **인라인 스타일로 배경/글씨색을 오버라이드**한다
(예: 고객정보 모달, 고객 검색칸). `.fi` 전역 색은 바꾸지 말 것(다른 어두운 화면 깨짐).

### 함정 E — HTML id 중복 금지
`getElementById`는 첫 번째 요소만 반환 → 렌더가 엉뚱한 곳으로 들어가 화면에 안 보임
(주마감보고 `wc_tb` 가 보험금청구 `wc_tb` 와 충돌했던 사례).
- **규칙**: 새 요소 id는 페이지 접두어로 유일하게(`bp_`, `wcl_`, `db_` 등). 추가 후 중복 스캔:
  `grep -oE 'id="[a-zA-Z0-9_]+"' index.html | sort | uniq -d`

---

## 3. 권한·역할 구조

- 로그인: 관리자 계정 `cu={id,name,role,admin:true}` / 팀원 `cu={id,name,admin:false,code}`.
- `ADMINS`: 백동현(BM), 박지순(BM), **이영현 총무(role:'총무')**.
- 헬퍼:
  - `_isAdmin()` = `cu.admin` (BM·총무 모두 true)
  - `_isChongmu()` = `cu.role==='총무'` (총무만)  ← "총무 전용" 권한은 이걸 쓴다
  - `_isLeader()` = TL 이상
- **고객 데이터 가시성**: 기본은 **본인 것만**. 총무만 전체(`_isChongmu()`).
  - 고객 목록(`rCustList`)·고객등록 현황(`rCustStatus`) 모두 이 규칙.

## 4. 알림 시스템 (`pushAlert` / `rAlerts` / `nalerts`)

- `pushAlert(toRole, type, msg, opts)` — 인앱 알림. `nalerts` 배열에 쌓이고 `sv('tops_nalerts')` 로 동기화.
- 수신 필터(`rAlerts`): `a.toRole===cu.role` **또는** `a.toName===cu.name` 이면 표시.
  - 역할 대상: `pushAlert('총무', ...)` / 특정인 대상: `pushAlert(null, type, msg, {toName:'홍길동'})`.
- **업무시간 지연 발송**: `opts.deliverAt` 이후에만 노출. 고객등록 요청 알림은 `notifyChongmuReg()` 사용
  → `_nextDeliverTime()` 로 **평일 09~18시·공휴일 제외, 그 외엔 다음 평일 09시** 계산.
  - 공휴일 표: `KR_HOLIDAYS_2026` (매년 갱신 필요).
  - 60초 주기 타이머가 `rAlerts()` 재실행 → 시간 되면 자동 노출.
  - ⚠️ 항상 켜진 서버가 없으므로 "정시 푸시"는 불가. **앱이 열려 있을 때/열 때** 노출되는 인앱 방식임.

## 5. 사업계획서 (bizplan)

- 데이터: `bizplan = {url, subs:[{m, ts, link?, memo?, file?, form?}]}`.
- 앱 내 작성 폼: `form = {name, rank, month, goals{...}, ipgwaja, prospects[], recruits[]}`.
- 문서 생성 공용 함수 **`_bizFormDoc(name, {toolbar, autoPrint})`** → 보기/출력/다운로드가 모두 이걸 사용.
  - 보기 `openBizFormPreview`, 출력 `printBizForm`, 다운로드 `downloadBizForm`(.xls).
- 저장 시 구글드라이브 `{팀원}/사업계획서/` 에 스프레드시트(`_driveSaveTable`)로 보관.

## 6. 보험금청구 (claims)

- 청구파일(PDF)은 보험사별 생성: `claims[idx].packagePDFs[insurer]`.
- 보관 3계층: **메모리 → localStorage `tops_pkg_<idx>__<ins>` → Firebase Storage(`pkgUrls[ins]`)**.
- 조회: `_claimPkgFor` → 없으면 `resolveClaimPkg`(Storage fetch) → 없으면 `_ensureClaimPkg`(자동 재생성, idx별 플래그).
- 생성: `generateClaimPackage(idx)`. 저장/재로드는 **반드시 `_persistClaims`/`_reloadClaims`** (함정 C 참조).

---

## 7. 작업 마무리 체크리스트 (커밋 전 매번)

1. **문법 검사**:
   ```
   node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");const re=/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0,b=0;while((m=re.exec(h))){i++;try{new Function(m[1]);}catch(e){b++;console.log("SCRIPT#"+i,e.message);}}console.log("script:",i,"오류:",b);'
   ```
2. **중복 id 스캔**: `grep -oE 'id="[a-zA-Z0-9_]+"' index.html | sort | uniq -d` (결과 없어야 함)
3. **새 목록 핸들러**면 함정 A(인덱스 vs 이름/ID) 확인.
4. **새 저장 코드**면 함정 B(`_lsSet` 사용, base64 금지) 확인.
5. 가능하면 핵심 로직을 작은 node 스크립트로 **모의 실행** 검증.
6. **gs(서버) 코드를 바꿨는지** 확인 → 바꿨으면 재배포 필요 안내. (index.html만 고쳤으면 재배포 불필요)
7. 커밋 후 `claude/admiring-fermi-1by3Z` 로 푸시.

## 8. 새 세션 인계

세션이 길어지면 `새세션` / `작업 마무리` 라고 하면 인계 프롬프트를 생성한다.
새 세션은 **이 CLAUDE.md + 현재 코드(정답지)** 를 기준으로 시작하면 완료된 작업을 다시 하지 않는다.
