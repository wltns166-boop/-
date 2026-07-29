# TEAM TOPS 인트라넷 — 세션 인계 프롬프트 (2026-07-27 작성)

> 아래 내용을 새 세션 첫 메시지로 복사-붙여넣기 하세요.

---

TEAM TOPS 인트라넷 작업을 이어서 진행합니다. 먼저 저장소의 CLAUDE.md를 읽고 시작하되, 아래 인계 내용(직전 세션 2026-07-23~27)이 CLAUDE.md보다 최신이므로 충돌 시 이 내용을 우선하세요.

[프로젝트]
- TEAM TOPS 보험대리점 인트라넷. 메인 파일은 `index.html` 단일 HTML 앱(HTML+CSS+JS 한 파일, 약 11,000줄). 구글드라이브 연동 서버는 `google-drive-sync.gs`(Apps Script 웹앱).
- 데이터: localStorage + Firestore(`tops/data`, 로그인용 경량 문서 `tops/auth`) 동기화. 파일/이미지/PDF는 Firebase Storage + 구글드라이브.
- 배포: 작업 브랜치에 커밋·푸시하면 GitHub Actions(`firebase-deploy.yml`)가 Firebase Hosting에 자동 배포. 별도 수동 배포 없음.
- 현재 배포 버전: **v2026.07.27-2** (로그인 화면 좌하단 `#lver`). 배포용 커밋마다 `#lver`를 `v2026.MM.DD-n` 형식으로 갱신할 것.
- 대화·주석·커밋 메시지는 한국어.

[작업 브랜치]
- **`claude/team-tops-intranet-handoff-s7gb6n`** — 2026-07-29부터 이 브랜치에서 작업하고 이 브랜치로 푸시. (이전 브랜치 `claude/customer-registration-contact-name-3os6lj`의 커밋을 모두 포함)
- `claude/**` 브랜치는 푸시 즉시 GitHub Actions(firebase-deploy.yml)가 라이브 배포함.

[지난 세션 작업 — 전부 커밋·푸시·Actions 배포 성공 확인됨. 다시 하지 말 것. `index.html`만 수정했고 functions/gs 변경 없음]

1. **가족구성원 고객등록요청 버튼 무반응 수정**: `requestCustRegFam`이 폼에서 제거된 `c.ins`에 의존해 조용히 return하던 것을, 본인과 동일한 보험사 선택 팝업(`requestCustReg(idx, famIdx)` → `sendCustReq`)으로 통합. 고객등록 현황(`rCustStatus`) 이름·비고에 `_esc` 이스케이프 추가.
2. **미성년자 법정대리인 선택 필수**: 만 19세 미만(`_isMinorRrn`)은 고객등록요청·메리츠 가설동 신청 시 법정대리인(부모) 선택 필수. 팝업 내 라디오(`req_parent`/`mz_parent`), 후보는 공용 헬퍼 `_parentOptsFor(c, famIdx)` — 자녀 대상이면 고객 본인+배우자 우선, 본인 대상이면 rel 부모 우선, 성인만, 폴백은 성인 가족 전체. 요청명(`reqName`)은 그룹핑 키라 불변 — `parent` 필드로만 저장. 현황 이름 아래 '법정대리인: 이름' 표시.
3. **법정대리인 영구 저장**: `_saveGuardian`이 요청 발송 시 고객 레코드(`family[i].parent` / `c.parent`)에 기록. `saveCust` 수정 저장 시 이름 기준 승계. 고객정보 모달은 영구 필드 우선 + 구버전 폴백(요청 큐 조회, 담당자 있는 고객만).
4. **고객등록 현황 삭제 버튼 전체 공개**: 팀원은 본인 미완료 건만 삭제 가능(완료 건은 총무만). `deleteAllCustReq`에 권한 가드 추가.
5. **발송 보험사 목록 데이터화**: `tops_reqins {son, life}` (sv/Firestore 동기화, `loadFromFirestore`·`startRealtimeSync` 매핑). 관리자 전용 [고객등록 보험사 수정] 버튼(`btn_reqins_edit`) + 편집 모달(`reqins_edit_popup`). 발송은 팝업 DOM의 `data-ins` 기준, 손해/생명 교차 중복 차단, 기본값 `_REQINS_DEFAULT`(손해 12 + 생명 18).
6. **고객정보 모달(`_renderCustInfoModal`) 개편**: 미성년 가족(자녀)은 이름·주민번호·연락처·직업·키/몸무게(+관계·담당자)만 표시. 법정대리인은 전체 정보 섹션(`grdHtml`, 동명이인 시 성인 우선 매칭). 성인/주고객 보기는 기존 유지.

[미해결 / 다음 확인 사항]
- 고객등록 폼 안 빠른 메리츠 신청(`requestMeritz`, 이름만 입력)은 주민번호 미입력이라 미성년 게이트 없음 — 필요 시 폼의 rrn을 읽어 확장.
- 관리자 권한은 클라이언트 체크뿐(firestore.rules는 로그인만 요구) — 서버 수준 차단을 원하면 규칙 작업이 별도로 필요.
- 이전 세션부터 잔존: 상단바 숨김(v2026.07.22-4) 사용자 확인 대기, 7/23 보고서 "오늘 반영 실적" 전일 대비 정확성 확인, 병력정리 PDF 드라이브 저장 실사용 검증, 구글드라이브 팀원 공유 문제, 팀원 비밀번호 변경 후 로그인 문의.
- 카톡 일일보고 운영 중(매일 18:30 발송, 주말 제외) — 건드릴 때 주의.
- CLAUDE.md의 작업 브랜치명 갱신 필요(위 [작업 브랜치] 참고).

[작업 방식]
- CLAUDE.md의 **함정 A~E**를 새 코드마다 확인: (A) 목록 핸들러에 정렬/필터된 표시 인덱스 넘기지 말고 고유 식별자 사용, (B) localStorage 직접 setItem 금지 → `_lsSet`, base64는 localStorage에 넣지 않음, (C) claims 재로드/저장은 반드시 `_reloadClaims()`/`_persistClaims()`, (D) 어두운 모달에 검은 글씨 금지 — 밝은 모달은 인라인 오버라이드, (E) HTML id 중복 금지(페이지 접두어 사용).
- **의미 있는 수정 후 자동 점검**: 가드 훅(`node .claude/hooks/intranet-guard.mjs`)이 매 턴 실행됨. 변경 직후 `intranet-guard` + `code-reviewer` 에이전트(둘 다 읽기전용)를 직접 호출해 점검하고, 확실한 문제는 고친 뒤 재점검. 사소한 오타 수정은 가드 훅만으로 충분.
- **커밋 전 체크리스트**: ① 인라인 스크립트 문법 검사(new Function 스캔 스크립트), ② 중복 id 스캔 `grep -oE 'id="[a-zA-Z0-9_]+"' index.html | sort | uniq -d`, ③ 함정 A/B 해당 여부 확인, ④ 배포용 커밋이면 `#lver` 버전 갱신, ⑤ gs를 바꿨으면 Apps Script 재배포 필요를 사용자에게 안내(index.html만이면 불필요).
- 배포·코드 수정 계열 에이전트(`apps-script-deployer`, `bug-fixer`, `intranet-builder`, `design-helper`, `html-css-designer`, `doc-writer`, `pdf-filler`)는 사용자가 명시할 때만 사용.
- 커밋 메시지는 한국어로 명확하게. 작업 브랜치로 푸시하면 Actions가 자동 배포하므로, 배포 확인은 Actions 성공 여부 + `#lver`로 판단.
