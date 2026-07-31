# TEAM TOPS 보험대리점 인트라넷 — 작업 노트 (CLAUDE.md)

> 이 파일은 **새 작업/새 세션을 시작할 때 가장 먼저 읽는 기준 문서**입니다.
> 같은 실수가 반복되지 않도록, 이 프로젝트의 구조·함정·규칙을 정리해 둡니다.
> 새로운 함정을 발견하거나 규칙이 생기면 여기 계속 추가하세요.

---

## 1. 프로젝트 개요

- **메인 파일**: `index.html` — 단일 HTML 인트라넷 앱 (HTML+CSS+JS 한 파일, 약 11,000줄)
- **구글드라이브 연동 서버**: `google-drive-sync.gs` — Apps Script 웹앱
- **데이터 저장**: `localStorage` + Firebase(Firestore) 동기화. 파일/이미지/PDF는 Firebase Storage + 구글드라이브.
- 작업 브랜치: `claude/team-tops-intranet-continue-ern63z` (2026-07-31부터. 이전: claude/team-tops-intranet-continue-eksojg)
- 대화·주석은 **한국어**로.

---

## 1.5 🔁 변경 후 자동 점검 규칙 (항상 지킬 것)

`index.html` 등 코드를 **의미 있게 수정한 턴**에서는, 답변을 끝내기 전에 아래를 **자동으로** 수행한다 (사용자가 따로 시키지 않아도):

1. **가드 훅** — 매 턴 종료 시 `node .claude/hooks/intranet-guard.mjs` 가 자동 실행됨(문법·id중복·저장패턴). 치명 문제(exit 2)면 마무리 전에 고친다.
2. **리뷰 에이전트 자동 호출** — 변경 직후 다음 두 에이전트를 **직접 invoke** 해서 결과를 확인하고, 확실한 문제는 고친 뒤 다시 점검한다:
   - `intranet-guard` (이 프로젝트 함정 A~E 심층 점검)
   - `code-reviewer` (일반 버그·보안·취약점)
   - 두 에이전트는 **읽기전용**이라 자동 호출해도 안전하다.
3. 단순 오타·문구 한 줄 수정 등 **사소한 변경**은 가드 훅만으로 충분하니 리뷰 에이전트 호출은 생략해도 된다(과한 토큰·지연 방지).

> ⚠️ **자동에서 제외**(반드시 사용자가 명시할 때만): `apps-script-deployer`(배포), `bug-fixer`/`intranet-builder`/`design-helper`/`html-css-designer`/`doc-writer`/`pdf-filler`(코드·파일 수정), `session-handoff`. 이들은 묻지 않고 돌리면 배포·수정 사고가 난다.

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

## 3.5 로그인 흐름 (2026-07 개편)

- 팀원 로그인: `mem[]`의 `lid/lpw` 검증. 관리자: `_admList()`(ADMINS 기본값 + `admov` 오버라이드).
- **로그인 전 사전 로드**: `_fetchAuthData()`가 Firestore **경량 문서 `tops/auth`** 만 읽음
  (mem 축약본 lid/lpw/code/name + admov id/pw). ⚠️ 로그인 전에 전체 문서(`tops/data`)를 읽으면
  업무 데이터가 미로그인 방문자에게 노출되므로 **FS_AUTH 외 읽기 금지**.
- 축약본은 전역 `mem`을 덮지 않고 `window._authMem`에만 보관(함정 C 예방). `_tryLogin()`이 mem → _authMem 순 조회.
- `tops/auth` 최신화: `_authDocSync()` — `sv('tops_mem'/'tops_admov')`, 관리자 병합 저장 2곳, `loadFromFirestore` 성공 직후 자동 호출(멱등).
- 호스팅 캐시: firebase.json `Cache-Control: no-cache` — 배포 즉시 반영.
- **로그인 화면 좌하단 버전 표시 `#lver`** — 기기가 옛 캐시 버전인지 판별용. **배포용 커밋마다 `v2026.07.09-2` 형식으로 갱신할 것.**

### 3.6 기기인증 (2026-07-29, 신규 기기 SMS 본인확인)

- **팀원**이 처음 보는 기기(브라우저)에서 로그인하면 등록된 본인 연락처(`mem[].phone`)로
  Firebase 전화 인증(SMS) 후 그 기기를 신뢰 기기로 등록. 이후 그 기기는 인증 없이 로그인.
- 게이트는 `_tryLogin()`의 팀원 경로에만 있음(`_devGate`). **관리자 계정·세션 복원(로그인 유지)·서버 캡처(?rr=1)는 게이트를 타지 않는다.**
- 신뢰 판정: ① 로컬 표식 `tops_devok`(기기별, `_lsSet`) → ② '아이디 저장'(`tops_sid`) 일치 시 최초 1회 자동 등록(기존 기기 grandfathering) → ③ SMS 인증.
- **락아웃 방지(fail-open)**: 연락처 미등록/형식 오류, 콘솔 전화 인증 미활성화·과금 미설정 등
  `_DEV_CFG_ERRS` 시스템 오류는 로그인을 막지 않고 통과시킨다(기기 등록은 안 함, 토스트 안내만).
- 저장: 기기ID `tops_devid`(로컬 전용, sv 동기화 안 함), 클라우드 `tops/devices` 문서
  `{팀원코드:{기기ID:{ts,nm,via,ua}}}` — sv()/tops_data와 무관한 별도 문서(merge 쓰기).
- 전화 인증은 **별도 Firebase 앱 인스턴스 `devauth`**(`_devAuth2()`)로 수행 — 본 앱 익명 인증 세션 보존.
- `tops/auth` 축약본에 `hp`(연락처) 포함(`_authDocSync`) — 새 기기가 로그인 전에 발송 번호를 알기 위함.
  ⚠️ 이 문서는 로그인 전에도 읽히므로 연락처가 익명 인증 사용자에게 노출됨(기존 lpw 평문과 동일한 구조적 한계).
  근본 해결은 서버(Cloud Functions)에서 SMS를 보내는 구조로 바꾸는 것 — 별도 작업 필요.
- 발송 실패는 **블랙리스트 방식**: `_DEV_RETRY_ERRS`(too-many-requests 등 재시도 오류)만 화면에 남기고
  나머지 미지의 오류는 전부 fail-open. 화이트리스트로 되돌리지 말 것(신규 에러코드 락아웃 위험).
- 관리자 UI: 구성원 관리 [기기인증 관리](`openDevMgr`) — 기기 조회·해제. 해제하면 `_devRevokeCheck`가
  다음 로그인부터 로컬 표식을 지워 재인증 요구.
- ⚠️ **Firebase 콘솔에서 Authentication > 전화 활성화 + Blaze 결제 필요** — 미설정이면 fail-open으로 동작(게이트 사실상 꺼짐).

### 3.7 카톡 DB 배정 알림 (2026-07-29)

- 관리자가 DB 배정 저장 시 `_kkDbAssignNotify()` → functions `dbassign` 액션 → 배정된 팀원의
  카카오 '나와의 채팅'으로 배정 내용(고객 성함·연락처·생년월일 포함, 200자 분할 최대 5통) 발송.
- 팀원 연동: DB 정보 페이지 [카톡 알림 연동] 버튼 → OAuth state로 로그인 팀원 이름 전달 →
  `users[kid].member`에 기록. **매칭은 member 필드만** 사용(닉네임 폴백 금지 — 사칭 오발송 방지),
  같은 이름 매핑 2개 이상이면 발송 보류. 승인제는 일일보고와 공용(관리자 [카톡 자동발송] 설정).
- ⚠️ 구조적 한계: `/api/kakao`의 approve 등은 익명 Firebase 토큰만 검증(서버 측 관리자 검증 없음)
  — 기존 firestore.rules 한계와 동일 계열. 근본 해결은 서버 권한 작업 별도 필요.
  관리자는 승인 전에 연동 목록의 [팀원: 이름]과 카카오 닉네임이 실제 본인인지 확인할 것.
- functions 배포: `.github/workflows/functions-deploy.yml` — functions/** 변경 푸시 시 자동.

### 3.8 카톡 일일보고 발송 대상자 (2026-07-30)

- 일일보고 자동발송(`_kkSendAll` — kakaoDaily/sendnow)은 **발송 대상자 명단**에게만:
  `kakao_private/cfg.reportTo`(이름 배열). 설정 모달에서 [+ 추가]/[빼기]로 관리(`reportto` 액션).
  **명단이 한 번도 저장되지 않았으면 기본값 `KK_REPORT_ADMINS`(관리자 3명)** 적용.
- 대상자 추가 후보는 "연동 계정에 member(팀원 이름) 지정된 사람"만. member 매칭으로 발송되므로
  연동·승인·팀원 지정(DB 정보 [카톡 알림 연동])이 안 된 대상자는 목록에 경고 표시 + 발송 불가.
- `kktest`(연결 테스트)·`dbassign`(DB 배정 알림)은 별도 경로라 이 명단과 무관 — 팀원에게도 발송됨.
  대상자에서 빼도 연동·승인은 유지되어 DB 배정 알림은 계속 감.
- 일일보고 설정 모달의 연동 계정 목록·연동 버튼은 제거(2026-07-30) — 계정 관리는 [카톡 알림 연동]으로 일원화.

### 3.9 인트라넷 사용량 집계 (2026-07-30)

- 메뉴(페이지)를 열 때마다 `showPage()` → `_usageTrack(name)` 이 Firestore **`tops/usage`** 문서에
  `{월(YYYY-MM):{이름:{메뉴키:횟수}}}` 를 `FieldValue.increment`(merge)로 기록 — 원자 증가라 동시 사용자 충돌 없음.
  sv()/tops_data·localStorage와 무관한 별도 문서(기기인증 `tops/devices`와 같은 패턴).
- 집계 제외: 미로그인, 서버 캡처(`?rr=1`), 사용량 페이지 자신(`usage`). 실패는 조용히 무시(앱 동작 무영향).
- 열람: 관리자 전용 메뉴 [인트라넷 사용량](`pg_usage`, 일일보고서 아래) — 월 셀렉트(`us_month`) + 메뉴×인원 표(`rUsage`/`_usageDraw`).
  행=PTITLES 순서(내비 순), 열=관리자 먼저+팀원 코드순(+데이터에만 있는 이름 뒤에). 페이지는 **흰 카드**라 어두운 글씨 사용(함정 D 역방향 주의).

### 3.10 일일보고서 실적 기준 — 스냅샷 확정(fin) 규칙 (2026-07-30)

- **현재실적** = 그날 18:29까지 입력분. 18:30 자동발송 때 `_kkBuildSummary(finalize=true)` →
  `_kkRecordSnapshot` 이 그날 dsnap 항목에 **`fin:1` 확정 표시** — 이후 밤 마감(23:30)·수동 발송·
  클라이언트 `_dsnapRecord` 어느 경로로도 **덮어쓰지 않는다**.
- **전날실적**(sec3) = 전날 보고서에 작성된 현재실적 **누적치 그대로**(`_dsnapSum(prevS.agg)`) — 하루 diff 아님.
- **오늘반영**(sec1) = 당일 현재실적 − 전날 스냅샷 누적치(`_dsnapDiff`).
- 확정 후 그날 보고서를 다시 열면(당일 조회) 화면도 확정값 기준(`dFin`) — 발송본과 수치 동일.
- 수동/테스트 발송(sendnow)은 확정하지 않음(kind==='auto'만). 자동발송 꺼짐·주말엔 fin 없음 →
  23:30 마감 기록이 그날 기준값이 됨(기존 동작 폴백).
- ⚠️ 관리자 명단·발송시간을 바꿔도 규칙은 "자동발송 시점 확정" — 시간 기반이 아니라 이벤트 기반.

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
6. **의미 있는 변경이면** `intranet-guard` + `code-reviewer` 에이전트를 자동 호출해 점검 (1.5 규칙).
7. **gs(서버) 코드를 바꿨는지** 확인 → 바꿨으면 재배포 필요 안내. (index.html만 고쳤으면 재배포 불필요)
8. 커밋 후 `claude/team-tops-intranet-continue-ern63z` 로 푸시. (⚠️ `claude/**` 브랜치는 푸시 즉시 GitHub Actions가 라이브 배포함)

## 8. 새 세션 인계

세션이 길어지면 `새세션` / `작업 마무리` 라고 하면 인계 프롬프트를 생성한다.
새 세션은 **이 CLAUDE.md + 현재 코드(정답지)** 를 기준으로 시작하면 완료된 작업을 다시 하지 않는다.
