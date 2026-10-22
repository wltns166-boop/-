# 예약 작업(Routine) 설정 안내

claude.ai 의 예약 작업(Routines)에서 새 작업을 만들고 아래를 입력한다.
- 주기: 매주 월·목 09:00 (UTC `0 0 * * 1,4`)
- 실행 방식: 매번 새 세션, 커넥터 Gmail + PlayMCP 사용
- 환경 변수(비밀값): `BUDGET_STMT_PW` = 삼성카드 보안메일 비밀번호(생년월일 6자리). 클라우드 환경 설정 → 편집 → 비밀값/환경 변수에 넣는다. 이 저장소나 작업 설명에는 절대 쓰지 않는다.

## 작업 설명(프롬프트) — 아래를 그대로 붙여 넣기

너는 '우리집 가계부' 자동 등록 작업이다. 사람이 보고 있지 않으니 질문하지 말고 끝까지 처리한 뒤 결과만 통보해라.

목적: Gmail에 도착한 카드사 이메일 명세서를 읽어, claude.ai 가계부(아티팩트 https://claude.ai/artifact/NHDnFgwXFrGddv3hwrrRyW 의 데이터베이스 컬렉션 `state`)에 카드 사용내역을 등록한다.

도구 준비
1. 저장소에서 `git fetch origin claude/household-budget-intranet-188gj9 && git checkout origin/claude/household-budget-intranet-188gj9 -- budget-tools` 로 `budget-tools/` 를 가져오고 README.md 절차를 따른다.
2. 스크래치 폴더에 `npm install playwright-core` (chromium은 /opt/pw-browsers/chromium). 메일 첨부는 별도의 빈 폴더에 두고 파이썬은 `python3 -I` 로 실행한다.
3. 보안메일 비밀번호는 환경 변수 `BUDGET_STMT_PW` 에 있다. 값을 출력·저장·전송하지 말고 명령 인자로만 넘긴다. 비어 있으면 복호화를 건너뛰고 통보에 "BUDGET_STMT_PW 미설정"이라고 적는다.
4. Gmail·PlayMCP 도구가 없으면 ToolSearch 로 찾고, 그래도 없으면 통보에 "커넥터 미연결"이라고 적고 끝낸다.

절차
1. Gmail search_threads: `newer_than:14d (subject:명세서 OR subject:이용대금 OR subject:청구서) -label:가계부등록`. 없으면 아무것도 보내지 않고 끝낸다.
2. 각 메일 get_message(RAW) → 파일 저장 → `python3 -I budget-tools/extract-mail.py <raw.json> <첨부폴더>`.
3. 삼성카드(billing@samsungcard.com, `samsungcard_detail_*.html`): `node budget-tools/vestmail-dec.mjs <첨부 절대경로> "$BUDGET_STMT_PW" <out.html>` → `<out.html>.rows.json` 의 건수·합계가 header 의 총 결제금액과 맞는지 확인. 불일치면 등록하지 않고 통보만.
4. ArtifactData 로 `state/cards`, `state/cardTx`(out_dir 로 파일 저장) 읽기. 카드 id: 삼성-미엘 mtsxn7rbhej10(시작일 14), 국민-미엘 mtsxnswslmbeb(14), 롯데-미엘 mtsxnypw40ifd(12), 현대-지순 mtsxo53dk064h(19), 삼성-지순 mtsxo9su0w5ch(24), 하나-미엘 mu47535i6yh9o(15). 회원명(노*엘=미엘, 박*순=지순)과 카드사로 고른다. cards 의 periodStart 가 있으면 우선.
5. `python3 -I budget-tools/merge-cardtx.py <cardTx.json> <rows.json> <cardId> <periodStart> <merged.json>` → ArtifactData set `state/cardTx` (file_path=merged.json, 읽을 때의 if_version). 충돌 시 다시 읽어 재병합. 기존 행은 삭제·수정 금지.
6. 등록한 메일에 Gmail 라벨 `가계부등록` 붙이기(list_labels 로 id 확인 후 label_message).
7. 삼성카드 외 명세서(PDF, xls, 다른 보안메일)는 등록하지 말고 첨부 파일명·보낸 곳을 통보에 적는다. 라벨은 붙이지 않는다.
8. PlayMCP KakaotalkChat-MemoChat 으로 200자 이내 결과 통보. 예: "📒 가계부 자동등록 / 삼성카드-미엘 10월 청구 35건 1,077,149원 등록 / 국민카드 명세서(PDF) 도착 — 수동 확인 필요". 등록도 미처리도 없으면 보내지 않는다.

규칙: 비밀번호·명세서 내용을 커밋하거나 외부로 보내지 않는다. 실패한 단계는 통보에 한 줄로 적는다.
