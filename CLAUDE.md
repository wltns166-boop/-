# TEAM TOPS 보험대리점 인트라넷 — 작업 노트 (CLAUDE.md)

> 이 파일은 **새 작업/새 세션을 시작할 때 가장 먼저 읽는 기준 문서**입니다.
> 같은 실수가 반복되지 않도록, 이 프로젝트의 구조·함정·규칙을 정리해 둡니다.
> 새로운 함정을 발견하거나 규칙이 생기면 여기 계속 추가하세요.

---

## 1. 프로젝트 개요

- **메인 파일**: `index.html` — 단일 HTML 인트라넷 앱 (HTML+CSS+JS 한 파일, 약 11,000줄)
- **구글드라이브 연동 서버**: `google-drive-sync.gs` — Apps Script 웹앱
- **데이터 저장**: `localStorage` + Firebase(Firestore) 동기화. 파일/이미지/PDF는 Firebase Storage + 구글드라이브.
- 작업 브랜치: `claude/team-tops-handoff-prompt-o9j855` (2026-08-10부터. 이전: claude/insurance-claim-document-reuse-fdje8i → claude/team-tops-intranet-continue-7wnjzh)
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

## 4.5 매니저 연락처 (mgrs, 2026-08-06)

- 홈 화면 공지사항/월간 일정표 아래 표 2개 — 좌: 손보사(`#mgr_son`) / 우: 생보사(`#mgr_saeng`). 열: 회사/매니저/이름/번호.
- 데이터: `mgrs={son:[{id('mg_..'),co,mg,nm,ph}],saeng:[...]}` — 동기화 키 `tops_mgrs`(텍스트만).
  loadFromFirestore + 실시간 스냅샷 양쪽 로드(둘 다 `rMgrs()` 재렌더), 로그인 직후 강제 재렌더 배열에도 포함.
- 열람 전원, [등록](편집)은 관리자만(`.ao` 버튼 + `_isAdmin` 가드 — 서버 미검증은 기존 구조적 한계와 동일).
- 편집: 인라인 모드(`mgrEdit`) — input 행 + [행 추가]/행별 [삭제]/[저장]/[취소]. 행 조작은 DOM 전체 수집 + `data-mgid` 기준(함정 A 안전).
  홈 흰 카드 위라 글씨 검정 인라인 지정(함정 D 역방향).
- 저장(`mgrSave`)은 클라우드 최신본 병합(_bizFreshSub 패턴): 편집 시작 시 기준선 id(`window._mgrBase`)를 기록해
  그 사이 다른 관리자가 추가한 행은 보존, 내가 삭제한 행(기준선에 있던 것)은 부활 안 함, 반대쪽 표는 클라우드 최신본 유지.
- 편집 중엔 `window._mgrEditing[side]` 플래그로 실시간 재렌더 생략(입력값 보존), 편집 재진입도 무시.

## 4.6 보험사 전산 바로가기 레일 (sansites, 2026-08-07)

- 화면 오른쪽 가장자리 고정 레일(`#san_rail`) — 평소엔 파비콘 아이콘만(44px), 호버 시 이름까지 펼침(158px). 모바일(≤768px) 숨김.
- 데이터: `sansites = {items:[{id('sn_..'), grp('son'|'saeng'|'etc'), nm, url}]}` — 동기화 키 `tops_sansites`(텍스트만).
  **url이 입력된 항목만** 레일에 표시(손보 → 생보 → 기타 순, 그룹 구분선). 기본값 `SAN_DEF_NAMES`(보험사 이름만, url 빈값).
- 아이콘: 구글 파비콘 서비스(`s2/favicons?domain=`) 자동 로드, 실패 시 이름 첫 글자 색 원(`.sanfb`) 대체.
- 관리: 환경설정(`pg_navset`)에 탭 신설 — [메뉴 구성](`ns_tab_menu`) / [전산 사이트 관리](`ns_tab_san`, `nsTab()` 전환).
  행별 구분/이름/링크 입력 + 행 추가/▲▼/삭제/기본 명단 복원/저장(`sanSave` — 관리자 가드, last-write-wins·navcfg와 동일 수용).
  행 조작 전 `_sanCollect()`가 화면 입력값을 id 기준으로 회수(함정 A 안전). 링크는 http/https 강제(`_sanUrlClean` — javascript: 무력화).
- 렌더 훅: login() 직후(로컬 캐시), 클라우드 초기 로드·onSnapshot의 `d.sansites`, 홈 강제 재렌더 배열. 열람 전원, 편집 관리자만(클라이언트 가드 — 기존 구조적 한계와 동일 계열).

## 4.65 홈 화면 꾸미기 (herocfg, 2026-08-10)

- 홈 상단 히어로(제목 `#hero_t`·부제 `#hero_s`·배경 `#hero_img`)를 환경설정 [홈 화면 꾸미기] 탭에서 편집.
- 데이터: `herocfg = {t,ts,tf,tc, u,us,uf,uc, img,fit('cover'|'contain'|'pct'),scale(가로%),sy(세로%),op}` — 동기화 키 `tops_herocfg`(텍스트·URL만, 함정 B).
  fit='pct'(크기 직접 조절)는 background-size `scale% sy%` — 가로/세로 슬라이더 + [대각선(함께 조절)] 체크(_heroScaleInput 동기화).
  `h`(영역 높이 px, 0=자동)=히어로 min-height+세로 가운데 정렬(flex) — 로고 이미지용 세로 공간. 제목은 **비우면 숨김**(t.trim()).
  `_heroCfg()`가 모든 저장값을 안전 범위로 정규화(크기 클램프, 색상 #rrggbb 정규식, 폰트 화이트리스트) — 외부 조작 데이터 방어.
- 이미지: 홈 배경 시즌 사진(openHomeBgModal)과 **같은 Storage `home_bg/` 경로·업로더(`_homeBgUpload`) 재사용**,
  표시 전 `_HERO_URL_RE` 버킷 화이트리스트 + CSS 탈출 문자 제거(homebg와 동일 원칙). 투명도는 이미지 레이어(`.heroimg`)에만 적용.
- 글씨체: `HERO_FONTS` 15종(구글 폰트, 기본 포함 16 항목) — **선택된 폰트만** `_heroFontLoad`로 지연 로드,
  환경설정 탭에서만 전체 로드(미리보기 갤러리·셀렉트). 새 폰트 추가 시 css2 쿼리(q)만 추가하면 됨.
- 렌더 훅: 부팅(로컬 캐시)·login()·loadFromFirestore·onSnapshot 네 곳에서 `_heroApply()` (sansites와 같은 패턴).
- 모바일: 제목 크기는 미디어쿼리에서 `min(var(--hero-ts),10vw)`로 화면 폭까지만 축소(`--hero-ts`는 _heroPaint가 설정).
  ⚠️ 옛 `34px!important` 고정으로 되돌리지 말 것 — 설정 크기가 무시되고 미리보기와 달라지는 결함이었음(2026-08-10 리뷰).
- 참고: 홈 배경 시즌 사진(openHomeBgModal, tops_homebg — 홈 전체 배경+흰 덮개)과는 별개 기능으로 공존(히어로 영역만 담당).
- 편집 화면: 저장 전 미리보기(`hh_prev`, 방금 고른 파일은 dataURL로 미리보기만 — 저장 시엔 Storage URL만 기록),
  [기본값 복원]은 화면만 되돌리고 [저장]해야 반영. 편집 관리자만(클라이언트 가드 — 기존 구조적 한계와 동일 계열).

## 4.66 팀 미팅 — 작성 대상자 명단 (mtcfg, 2026-08-10)

- 팀원별 미팅 현황 표 머리의 [작성 대상자 관리](`mt_targets_btn`, 관리자 전용 체크박스 모달 `mtTargetsOpen`).
- 데이터: `_mtCfg={targets:[이름...]}` — 동기화 키 `tops_mtcfg`(텍스트만). **빈 배열=전체 표시**(리쿠르팅 rc_targets와 동일 패턴·수용 한계도 동일: last-write-wins, 이름 문자열 기반).
- 필터 적용: **현황 표(rMeetingList) + 표1 팀원 선택 드롭다운(`_mtMemFill`, 2026-08-10 확장)**. 기록 권한(`_mtRoster`)은 그대로
  (명단 밖 팀원 기록도 데이터상 가능·기존 데이터 열람은 [보기] 경로 유지). 명단 저장 시 선택 중이던 팀원이 빠지면 표1 초기화.
  실시간 수신 시엔 드롭다운만 갱신(rMeetingSec1 재렌더 안 함 — 편집 중 특이사항 보호).
- 로드 훅: 부팅(로컬 캐시)·loadFromFirestore·onSnapshot의 `d.mtcfg`(herocfg와 같은 패턴, 수신 시 _mtMemFill+rMeetingList 재렌더).
- **주차별 피드백 (2026-08-10)**: 표1 주마감보고 표에 [피드백] 열(작성완료/미작성 버튼) — 클릭 시 주차 행 아래 입력행 토글.
  저장은 `meetings[].wnotes={주차키:{note,by,ts}}`(동기화 포함, 텍스트만). 주차키('YYYY-MM-DD')가 식별자(함정 A)·정규식 가드.
  저장 시 전체 재렌더 대신 **버튼·입력행만 갱신**(월 특이사항 칸 미저장 입력 보존), 미저장 감지는 `data-orig` 비교(`_mtFbDirty` —
  년/월/팀원 이동 가드 `_mtGuardUnsaved`에 포함). [보기] 새 창 주차 표에도 피드백 열 표시. 월 특이사항(mtSaveNote·mtToggleDone)은
  Object.assign 복사라 wnotes 자동 보존. showPage 진입부에도 같은 가드(pg_meeting active + 미저장 시 confirm) —
  사이드바 메뉴 이동으로 미저장 입력이 조용히 날아가던 기존 구멍 보완(2026-08-10 리뷰).
- **주차별 미팅 내용 (2026-08-10)**: 특이사항 영역이 주차별 입력칸(`#mt_wm_box`, data-mtwm=주차키)+월 종합 메모(`mt_note`)로 구성.
  저장은 `meetings[].wmeet={주차키:{note,by,ts}}`(mtSaveNote가 월 메모와 함께 일괄 저장·빈 칸은 삭제, 텍스트만).
  미저장 감지 `_mtWmDirty`(data-orig) — 이동 가드·대상자 저장 시 초기화 확인에 포함. [보기] 새 창도 주차별+월 종합 표시.
  주차별 "피드백"(wnotes, 표1 피드백 열)과는 별개 필드 — 피드백=주마감보고에 대한 코멘트, wmeet=미팅에서 나눈 내용.

## 4.7 고객등록 — 외국인 등록증 첨부 (alienIds, 2026-08-07)

- 고객등록 폼 특이사항 옆 업로드 박스(`#cust_alien_box`) — 사진·PDF, 파일선택(모바일 사진첩)·붙여넣기(Ctrl+V)·드래그앤드롭.
- 원본은 **Storage `claim_packages/alien_ids/`**(기존 규칙 커버, 이미지 1600px JPEG 축소·PDF 25MB 상한),
  고객(`custs[].alienIds=[{u,k,n}]`)에는 **URL만**(함정 B — tops_custs에 base64 금지). 업로드는 첨부 즉시, [저장] 눌러야 고객에 기록.
- 버퍼 `window._custAlien`(toggle/editCust에서 리셋·로드). ✕로 뺀 새 업로드는 즉시 Storage 정리,
  저장된 파일은 [저장] 시 빠진 URL만 정리(취소하면 원상 유지). 수정 화면에서 열람(이미지 클릭 원본·PDF 링크).

## 4.8 전역 파일 업로드 공용화 (uni, 2026-08-07)

- 문서 레벨 공용 리스너(`_uniFindBox`/`_uniAssign` 등) — **모든 `<input type=file>` 칸**에 드래그앤드롭·붙여넣기(Ctrl+V) 지원.
  파일 입력을 정확히 1개 품은 조상 영역을 찾아 input.files에 주입(DataTransfer) 후 change 이벤트 발생 → **기존 onchange 로직 그대로 동작**.
- accept 필터 존중(image/*, .pdf 등 — 안 맞으면 토스트), 단일 입력엔 첫 파일만. 드래그 오버 시 `.uni-drop` 초록 표시.
- 붙여넣기 대상: 마지막 클릭한 칸 → 화면에 파일 칸이 1개뿐이면 그 칸 → 여러 개면 "칸을 먼저 클릭" 토스트.
- 전용 핸들러 구역(청구 서류 박스·고객등록 등록증)은 stopPropagation/defaultPrevented로 공용 처리에서 제외(이중 처리 없음).
- ⚠️ 병력정리(f1~f3)는 accept=.pdf — 분석이 PDF 텍스트 추출 기반이라 사진은 불가(명확한 토스트로 안내).
- ⚠️ **클릭 추적은 좁게**: 마지막 클릭 칸 기억(mousedown)은 파일 입력 자신·라벨·2단계 이내만.
  행/카드에 파일 입력 1개 + 무관한 버튼이 함께 있는 화면(수험표·녹취)에서 넓게 잡으면 남의 행 오귀속 사고.
- ⚠️ 청구·고객등록 페이지는 기존 문서 레벨 catch-all(drop preventDefault)이 uni drop보다 먼저 걸림 —
  이 두 페이지에 **새 파일 칸을 추가하면 전용 드롭 핸들러를 직접 달아야 함**(uni가 조용히 무시됨).

## 5. 사업계획서 (bizplan)

- 데이터: `bizplan = {url, subs:[{m, ts, link?, memo?, file?, form?}]}`.
- 앱 내 작성 폼: `form = {name, rank, month, goals{...}, ipgwaja, prospects[], recruits[]}`.
- 문서 생성 공용 함수 **`_bizFormDoc(name, {toolbar, autoPrint})`** → 보기/출력/다운로드가 모두 이걸 사용.
  - 보기 `openBizFormPreview`, 출력 `printBizForm`, 다운로드 `downloadBizForm`(.xls).
- 저장 시 구글드라이브 `{팀원}/사업계획서/` 에 스프레드시트(`_driveSaveTable`)로 보관.
- **관리자 피드백 (2026-08-03)**: 제출 건에 `fb/fbBy/fbByRole/fbTs/fbPrintTs` — 작성·출력 기록은 관리자 전용,
  **열람도 관리자만**(`_bizFbVisible` — 팀원 본인도 안 보임. 폼 아래 피드백 칸도 관리자에게만 렌더).
  저장 직전 `_bizFreshSub`로 클라우드 최신본 병합(동시 저장 경합 축소).
- **작성자 설정 (2026-08-03)**: `bizplan.writers`(이름 배열) — 제출 현황 표시·집계 명단. 미설정/전원 선택=전체.
- **카톡 발송 (2026-08-03, 관리자 전용)**: `bizKakaoSendAll`(일괄)/`bizKakaoSendOne`(개별) → functions `bizsend` —
  서버가 `?rr=1&bz=이름1|이름2` 화면(`_bzDeepLink`가 문서를 iframe으로 쌓아 렌더, `#bz_paper_<i>`)을
  헤드리스 크롬으로 캡처 → Storage `biz_plans/auto/`(30일 보관) → 수신 관리자 '나와의 채팅'에 이미지 카드.
  수신자는 서버에서 `KK_REPORT_ADMINS`로 강제, 전역 30초 간격 제한. 양식(form) 제출 건만 캡처 가능.
  `_bzDeepLink`는 **관리자 가드 필수**(일반 팀원이 ?rr=1&bz=이름 으로 남의 계획서를 여는 것 차단).
  ⚠️ 구조적 한계: bizsend도 요청자 관리자 검증은 없음(익명 토큰 + 수신자 제한으로 완화) — claimsend와 동일 계열.

## 5.5 리쿠르팅 리스트 (recruit, 2026-08-05)

- 팀관리 > 사업계획서 아래 메뉴(`pg_recruit`). 데이터: `recruit = {flds?, cards:[]}` — 동기화 키 `tops_recruit`(텍스트만).
- 카드: `{id('rc_<ts>_<rand>'), owner, ts, dt, ut, vals:{항목id: 값|[값...]}, prints:[{by,dt}]}`.
  탐색·수정은 **항상 카드 id**(`window._rcCur`) 기준(함정 A). ◀▶ 넘김·왼쪽 대상자 리스트(`rc_list`, 이름 클릭 이동·`rc_count` 인원)·[페이지 추가].
- **기본 1페이지 (2026-08-06)**: 카드 0장이면 미저장 초안(`window._rcDraft`)을 자동 표시 — [저장]하면 실제 등록,
  [페이지 추가] 시 빈 초안은 버림(값 있으면 dirty 버퍼로 함께 저장). 입력 칸은 세로 가운데 정렬(min-height+flex).
- **항목 가로 분할**: `flds[].hs` — 세부 칸을 옆으로 나란히(표 분할) 배치. 항목 관리의 [가로 분할] 체크, 폼·출력표 모두 반영.
- **양식 항목**: `recruit.flds`(관리자 [항목 관리]로 추가/삭제/순서/세부칸 편집, 전 팀원 공통). 미설정이면 `RC_DEF_FLDS`(사진 양식).
  항목 삭제해도 카드의 기존 값 데이터는 보존(화면에서만 숨김) — `_rcCollect`가 화면에 없는 값 유지.
- **가시성**: 팀원=본인만, 팀장급=본인+하부(`getMyTeam()` — 출장보고와 동일), 관리자=전체. 편집/삭제는 본인 또는 관리자.
- **카드 화면 기본 표시 (2026-08-10)**: 왼쪽 대상자 리스트·◀▶ 탐색은 **내 카드만**. 팀원 카드는 팀원 작성 현황 [보기]로
  열며, 그동안 리스트·탐색이 그 팀원의 카드들로 잠시 전환([← 내 카드로] 행으로 복귀). 권한(_rcVisible)·팀원 작성 현황
  표·PDF/출력 범위는 기존 그대로 — 표시 기본값만 좁힌 것.
- **저장 경합 축소**: 저장/삭제/출력기록/항목저장은 `_rcFresh(mut)` — 클라우드 최신본 병합 후 저장(_bizFreshSub 패턴),
  같은 기기 내 호출은 큐(`_rcFreshQ`)로 직렬화. **미저장 버퍼 `window._rcDirty`**(카드 id→편집본)가
  여러 카드를 오가며 편집한 내용을 전부 보존 — 실시간 스냅샷이 recruit를 통째 교체해도 버퍼가 살아 있고,
  `_rcFresh`가 버퍼 전체를 로컬 우선으로 병합해 함께 저장 후 버퍼를 비움([출력]도 이 경로라 미저장 입력이 함께 저장됨).
  삭제 시엔 `_rcCur`·버퍼에서 먼저 빼서 병합이 삭제 대상을 붙잡지 않게 함(부활 방지).
  편집 중 다른 기기가 그 카드를 삭제하면 화면본(`_rcShown`)으로 이어가고 [저장] 시 재등록.
- **출력**: `printRcCard` — 새 창 인쇄, 팝업 성공 시에만 `prints`에 기록(출력완료 오표시 방지). 출력 여부는 카드 하단·빠른이동에 표시.
- **팀원 작성 현황 팀 필터·대상자 (2026-08-07)**: 헤더에 팀 드롭다운(`rc_team_sel` — 팀장별 본인+산하 `_rcTeamOf`, belong 재귀)과
  [작성 대상자 관리](`rc_targets_btn`, 관리자 전용 — 체크박스 모달 `rcTargetsOpen`). 명단은 `recruit.targets`(이름 배열,
  **빈 배열=전체** — Firestore 중첩 병합이라 delete 대신 빈 배열), 저장은 `_rcFresh` 경유. 전원 체크/해제=전체 표시.
- **팀원 작성 현황 (2026-08-06)**: 카드 아래 표(`rc_team_box`, 팀장급 이상만 — `_rcTeamDraw`) — 이름/직급/작성여부(n장·미작성)/
  [보기](카드 화면 이동)·[PDF 저장](`rcTeamPdf` — 카드 1장=1페이지 한 파일)·[출력](`rcTeamPrint` — 전체 인쇄+카드마다 출력 기록).
  행=가시 범위 mem(코드순)+명단 밖 작성자 뒤에. 버튼은 data 속성+이름 기반(함정 A). PDF/출력은 연타 가드, 카드별 실패는 건너뜀.
  ⚠️ 한계: 카드 owner가 이름 문자열이라 **동명이인이 생기면 한 줄로 합쳐짐** — 표에 경고 표시, 근본 해결은 코드 기반 리팩터링 별도 과제.
  ⚠️ [출력]/[PDF]의 _rcFresh 경유 저장은 미저장 버퍼(_rcDirty)도 함께 영구 저장함(설계상 의도 — 데이터 보존 우선).
- **PDF 저장**: `rcSavePdf` — 기존 `_drEnsureLibs`/`_drPdfFromCanvas`(html2canvas+jsPDF) 재사용, 파일 다운로드.
- **사업계획서 연동 (2026-08-10)**: 대상자 이름 문자열 기준 양방향(동명이인 한계 동일 계열). 카드 값 매핑은
  `vals.name`/`vals.job` 키 — 세부 칸 위치는 **칸 라벨로 탐색**(`_rcSubIdx('name','이름',0)` 등, 순서 변경에 안전),
  양식에서 세부 칸을 없앤 필드는 단일 텍스트로 저장(배열이 화면에 안 보여 저장 시 유실되던 리뷰 지적 반영).
  ① `saveBizForm`→`_bizRecruitToCards`: 양식의 대상자 중 리스트에 없는 이름은 카드 자동 생성(_rcFresh 병합 안에서 중복 검사).
  ② `saveRcCard`→`_rcCardToBiz`: 제출된 양식(sub.form)이 있으면 대상자 표에 행 추가/나이·직업 갱신(_bizFreshSub 경유,
  제출본 없으면 생성하지 않음 — 가짜 제출 방지). 본인이 양식을 열어둔 상태면 작업본(_bizForm)에도 반영.
  ③ `_bizLoadForm`: 양식을 열 때 내 카드 대상자를 자동 채움(이름 없을 때만, 빈 줄부터).
  ⚠️ 양식에서 대상자 행을 지워도 카드가 남아 있으면 ③이 다시 채움 — 빼려면 리쿠르팅 리스트에서 카드 삭제.
- 실시간 수신 재렌더 시 카드 안에 포커스가 있으면 `rRecruit`가 생략(입력값 날림 방지).

## 5.6 환경설정 — 메뉴 구성 (navcfg, 2026-08-05, 관리자 전용)

- 사이드바 맨 아래 [환경설정](`n_navset`, `.ao`) — 메뉴 이름 변경·순서 변경·숨김·메뉴 추가·기본값 복원.
- 데이터: `navcfg = {ren:{navId:이름}, hide:{navId:1}, ord:{'_top'|nch_아이디:[navId...]}, customs:[{id('cm_..'),label,loc,type('page'|'link'),url?,content?}]}`
  — 동기화 키 `tops_navcfg`(텍스트만). 로드·실시간 수신 시 `_navApply()` 즉시 적용.
- **적용 방식(`_navApply`)**: 정적 사이드바 DOM을 손보는 멱등 함수. `setAdmin()` 끝에서 매번 재적용.
  - 이름: 텍스트 노드만 교체(아이콘·접기 화살표 보존). 페이지 상단 제목은 `_ptitle(name)`(showPage)이 반영.
  - 순서: 같은 컨테이너 안에서만 이동(최상위 블록=.ni+.nch 묶음, 그룹 내부=.ns). `n_navset`은 항상 맨 아래 고정.
  - 숨김: **`.cfg-hide` 클래스(display:none !important)로만** — setAdmin의 권한별 인라인 표시값과 충돌하지 않고,
    해제 시 권한 처리 결과가 그대로 복원됨(⚠️ 인라인 style로 바꾸지 말 것 — 권한 숨김을 되살리는 사고 위험).
  - 기본 이름/순서는 최초 적용 전에 `_navDefaults`/`_navDefOrder`로 캡처(기본값 복원의 기준).
- **추가 메뉴**: 내용 페이지(`cm_*` — 공용 `pg_custom`에 `rCustomPage` 렌더, 전원 열람·관리자만 편집) 또는
  외부 링크(**http/https만** — `javascript:` 등은 https:// 접두로 무력화). 삭제는 추가 메뉴만, 기본 메뉴는 숨김만.
- **하위 메뉴 (2026-08-05)**: [+ 메뉴 추가]는 최상위 전용. 각 줄의 초록 ↳+ 버튼(그룹 머리·최상위 추가 메뉴에만)으로
  하위 커스텀 추가(loc=`nch_<부모컨테이너>`). 최상위 추가 메뉴에 첫 하위가 생기면 접기 그룹으로 전환
  (`_navApply`가 `nch_cm_*` 컨테이너·`nc_cm_*` 화살표 자동 생성/제거, 클릭=tnav 토글). 그룹 삭제 시 하위도 캐스케이드 삭제.
- 설정 목록: 숨김 체크한 항목은 각 목록(최상위/그룹) **맨 아래로 정렬**(`_nsSortHidden`, 저장 시 실제 순서에도 반영),
  행 호버 표시는 `.nsrow:hover`.
- showPage 통합: `pg_` 조회 폴백(cm_* → pg_custom), navset 관리자 가드, r맵 밖 cm_* 렌더 분기.
- **내용 페이지 게시판 (2026-08-05)**: `cm_*` 페이지는 **게시판이 주 화면** — 목록은 대표이미지 썸네일+제목 카드 그리드
  (`.bdgrid` 4열·모바일 2열, 12개=4×3 단위 페이지 넘김 `_bdPage`), 카드 클릭 → 상세(`_bdOpenPost`, [목록으로] 복귀,
  메뉴 클릭 시 목록으로 초기화). 소개 글(cmEdit/cmSave)은 제거됨(2026-08-05, customs[].content 데이터만 잔존).
  게시물(`boards={cm_id:[{id('po_..'),title,body,files,vm,by,dt,ts}]}`,
  동기화 키 `tops_boards` — 텍스트·URL만). 파일 원본은 **Storage `board_files/`**(storage.rules 추가됨, 이미지=캔버스 1600px JPEG 축소,
  PDF=25MB 상한). 표시 전 자체 버킷 `board_files/` URL 화이트리스트(`_BD_URL_RE`). 작성/수정/삭제 관리자만, 열람 전원.
  `vm`: 게시물별 사진 보기 방식 — 'swipe'(이전/현재/다음 3장 나란히 — 가운데 크게·양옆 흐리게(클릭 이동),
  카운터는 가운데 기준, 순환 없음(끝에서 버튼 비활성), 앞뒤 2장 preload로 즉시 넘김, 하단 전체 썸네일 줄(클릭 이동,
  현재 장 파란 테두리·자동 스크롤), ←/→ 방향키 넘김(입력 중·모달 열림·목록 상태 무시), `_bdSwipeHtml`/`_bdSwipeRefresh`) /
  'scroll'(세로 나열).
  **첨부 종류 (2026-08-05)**: 사진·PDF·엑셀(xls/xlsx/csv)·PPT(ppt/pptx)·동영상(video/*, 200MB) — `_bdFileKind` 판별.
  동영상=인라인 `<video>` 재생(팀원 controlsList=nodownload, 관리자 원본 링크), 엑셀·PPT=**전원 다운로드 버튼**
  (미리보기 불가한 작업용 양식 — 팀원 차단 정책의 예외), xls/ppt/vid 업로드는 `_bdRawUpload`(원본 그대로, 25MB/25MB/200MB).
  **PDF 인라인 열람 (2026-08-05)**: PDF 업로드 시 pdf.js(전역 로드됨)로 페이지별 JPEG(`files[].pages`, 최대 40쪽, 1400px)를
  생성해 사진과 함께 뷰어(`_bdViewImgs`)에 통합 표시 — 팀원은 다운로드 없이 열람. 예전 PDF는 [수정]→[저장] 때 자동 마이그레이션.
  **파일 접근 권한**: 팀원=인라인 열람만(원본 링크·PDF 버튼 없음, 우클릭/드래그 억제),
  관리자=이미지 클릭 원본·[원본 PDF] 다운로드. 40쪽 초과 PDF는 `pgTotal` 표식 + 열람 화면 안내.
  ⚠️ 구조적 한계: "팀원 다운로드 차단"은 **UI 억제 수준** — 이미지 URL(토큰 포함)이 페이지 소스·개발자도구에 노출되며
  Storage 규칙도 로그인만 요구(board_files 쓰기·삭제 포함). 진짜 차단은 서버 권한(custom claim) 작업 필요 — 별도 과제. **대표이미지(썸네일)**: `post.cover`(작성 모달 [대표이미지 등록], 파일 추가 위)
  → 없으면 `files[].rep`([대표] 라디오) → 첫 사진/PDF 1페이지 순. rep 이미지는 뷰어 첫 장. 저장은 `_bdFresh`(클라우드 병합,
  병합 예외는 호출부로 전파 — 실패했는데 성공 토스트 금지). 업로드는 성공분을 즉시 확정 목록으로 승격 —
  중간 실패 후 재시도 시 남은 파일만 올라감(중복·고아 방지). 편집 중 다른 관리자가 삭제한 게시물은 저장 시 재등록(리쿠르팅과 동일 의도).
  게시물·수정에서 뺀 첨부는 저장 후 Storage에서도 정리(최선 노력).
- 저장(`nsSave`)은 클라우드 최신본에서 내용 페이지 본문을 항상 재수집(다른 관리자의 `cmSave` 본문을 스냅샷이 되돌리지 않게).
  구성(이름·순서·숨김)은 last-write-wins — 관리자 전용이라 수용. 설정 목록에서 요청관리 하위 3개(통합 페이지 대체) 제외.
- ⚠️ 구조적 한계: `_isAdmin()` 가드는 클라이언트 전용 — firestore.rules가 로그인만 요구해 팀원도 콘솔로
  `navcfg`를 쓸 수 있음(기존 bizsend·claimsend와 동일 계열, 메뉴 표시 전체에 파급). 근본 해결은 서버 권한 작업 별도 과제.

## 6. 보험금청구 (claims)

- **고유 id (2026-08-03)**: 각 청구건은 `id`(`clm_<ts>_<rand>`)를 가진다.
  - 부여는 **저장 경로에서만**: `saveClaim`(신규/수정), `_persistClaims`(`_claimsEnsureIds`), `generateClaimPackage`.
    ⚠️ 재로드 때 메모리에 임시 부여 금지 — 기기마다 다른 id가 생겨 캐시 키가 흔들린다.
  - 기존 건 마이그레이션: `_claimsIdMigrate()` — loadFromFirestore에서 **관리자 기기만** 세션 1회(멱등).
  - `_reloadClaims` 병합은 **id 우선 매칭**(순서 밀림 무관), id 없으면 기존 3중 대조(고객명·등록일·담당자) 폴백.
- 청구파일(PDF)은 보험사별 생성: `claims[idx].packagePDFs[insurer]`.
- **생보사 팩스번호 (2026-08-07)**: 청구보험사에서 생명보험사(`_reqInsLists().life`) 체크 시 `#claim_fax_wrap`에
  보험사별 팩스번호 입력칸 표시(`_claimFaxDraw` — 재렌더에도 입력값 보존, 수정 시 `window._claimFaxPre`로 프리필).
  저장은 `claims[].faxNums={보험사명:번호}`(텍스트만), 청구현황 보험사 카드에 📠 표시.
- 보관 3계층: **메모리 → localStorage `tops_pkg_<id>__<ins>`(레거시 `tops_pkg_<idx>__<ins>` 읽기 폴백) → Firebase Storage(`pkgUrls[ins]`)**.
  - 삭제 시 `_claimPkgCachePurge`가 id 캐시 제거, `_claimsPkgSweep`가 고아 id 캐시 청소(클라우드 수신 후 세션 1회) — localStorage 포화 완화.
- 조회: `_claimPkgFor` → 없으면 `resolveClaimPkg`(Storage fetch) → 없으면 `_ensureClaimPkg`(자동 재생성, idx별 플래그).
- **공유 메타 회수 (2026-08-07)**: 모든 claims 저장 경로(_persistClaims·saveClaim·generateClaimPackage 최종 sv) 직전에
  `_claimsCarryCloudMeta` — 로컬 배열에 pkgUrls(빈 객체 포함)·pkgId·pkgStamp·attachUrls·attachMeta가 비어 있으면
  `window._claimsCloud`(수신된 최신본)에서 id 기준으로 회수. 낡은 기기의 상태 변경·수정 저장이 공유 기록을
  지워 총무 기기에서 청구파일이 사라지던 실사고의 재발 방지.
- **캐시 무효화 (2026-08-07)**: 생성 시 `claims[].pkgStamp=Date.now()`(동기화) + 생성 기기는 `tops_pkgseen_<id>` 기록.
  `_claimPkgFor` 초입 `_claimPkgFreshCheck`가 도장이 더 새로우면 이 기기의 옛 캐시(메모리 packagePDFs·tops_pkg_*)를
  비우고 새 공유본을 받게 함 — 총무 기기가 반쪽 캐시를 계속 보여주던 문제 해결. 공유 업로드 실패는 생성 기기에 ⚠ 토스트.
- 생성: `generateClaimPackage(idx)`. 저장/재로드는 **반드시 `_persistClaims`/`_reloadClaims`** (함정 C 참조).
- **원본 서류 클라우드 보관 (2026-08-07)**: `claims[].attachUrls={files:[{u,n}],ins:[{u}]}` —
  저장 시 `_claimAttachStore`가 병원서류·보험사청구파일 원본을 **Storage `claim_packages/attach/<청구id>/`** 에 올리고 URL만 동기화.
  generateClaimPackage는 로컬 원본이 없으면 보관본을 내려받아 병합 — **어느 기기서든 완전한 재생성 가능**.
  (배경: 클라우드 스냅샷이 로컬 tops_claims를 원본 빠진 사본으로 덮어써, 새로고침 후엔 등록 기기에서도 원본이 사라졌음)
- **반쪽 재생성 방지 (2026-08-07)**: `claims[].attachMeta={f,id,bank,ins}`(첨부 개수 메타 — 동기화 포함, saveClaim에서 기록).
  원본 base64는 동기화 제외라, **다른 기기의 자동 재생성이 첨부 없는 청구서만으로 팀 공유본(Storage pkgUrls)을
  덮어쓰던 사고**를 generateClaimPackage 초입 가드로 차단. **차단 기준은 병원서류(f·ins)만** —
  신분증·통장사본은 없어도 생성 진행하고, 이 기기에 없으면 **보관함(claim_docs URL) fetch로 자동 병합**(2026-08-07 완화).
  구형 건(메타 없음)은 가드를 못 탐 — 등록 기기에서 재생성해야 완전한 파일이 공유됨.
- **첨부 PDF 병합 폴백 (2026-08-07)**: 병원서류 PDF는 pdf-lib 직접 병합 → 실패 시(암호화된 병원 발급 PDF 등)
  `_pdfToImages`(pdf.js 페이지별 JPEG 렌더, 40쪽 상한, 파일별 캐시로 보험사 수만큼 반복 방지)로 병합.
  그래도 실패하거나 일부만 들어가면 `attachWarn` 토스트로 알림(조용한 누락 금지).
  ⚠️ 첨부 직접 병합에 `ignoreEncryption` 쓰지 말 것 — 암호화 PDF가 빈 페이지로 "성공" 병합되는 사고 위험(래스터 폴백이 정답).
- **빈배열 덮어쓰기 가드 (2026-07-31)**: 클라우드 d.claims가 빈 배열이고 로컬에 내역이 있으면
  `_claimsCloudApply`가 로컬을 유지(+토스트). 단 `_persistClaims`가 0건 저장 시 남기는
  `claimsClearedAt` 표식이 "아직 처리 안 한 새 값"이면 의도된 전체 삭제로 보고 정상 반영
  (기기별 처리 표식: `tops_claims_seenclear`). → 청구 등록 직후 사라지던 증상·삭제 부활 둘 다 방지.
- **[카톡] 발송 (2026-07-31, 청구현황 관리자 전용)**: `claimKakaoSend(i)` → functions `claimsend` —
  청구파일 Storage 링크를 요청 관리자 본인의 '나와의 채팅'으로 발송(파일 첨부는 카카오 API 미지원 → 링크).
  카카오 링크 도메인 제한 때문에 `인트라넷/?pdf=<URL>` 경유로 열며, 클라이언트·서버 모두
  **이 프로젝트 버킷 `claim_packages` 경로 URL만** 허용(오픈 리다이렉트 방지). 서버는 발송 대상을
  **KK_REPORT_ADMINS(관리자 3인)로 제한** — 익명 토큰만으로 임의 팀원에게 링크를 보내는 스팸 차단.

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
8. 커밋 후 **1장의 현재 작업 브랜치**로 푸시. (⚠️ `claude/**` 브랜치는 푸시 즉시 GitHub Actions가 라이브 배포함 — 낡은 브랜치에서 푸시하면 옛 코드가 배포되니, 반드시 최신 작업 브랜치 위에서 작업할 것)

## 8. 새 세션 인계

세션이 길어지면 `새세션` / `작업 마무리` 라고 하면 인계 프롬프트를 생성한다.
새 세션은 **이 CLAUDE.md + 현재 코드(정답지)** 를 기준으로 시작하면 완료된 작업을 다시 하지 않는다.
