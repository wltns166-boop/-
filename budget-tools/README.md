# 가계부 자동 등록 도구

카드사 이메일 명세서를 읽어 우리집 가계부(claude.ai 아티팩트 DB)에 카드 내역을 넣는 스크립트.
예약 작업(Routine)이 매주 실행하며, 사람 손 없이 돌아간다.

## 흐름
1. Gmail에서 최근 명세서 메일 검색 (`subject:명세서 OR subject:이용대금`, 라벨 `가계부등록` 없는 것).
2. `get_message(RAW)` 결과를 파일로 저장 → `extract-mail.py`로 첨부 추출.
3. 첨부가 VestMail 보안 HTML(삼성카드 등)이면 `vestmail-dec.mjs <html> <비밀번호> <out.html>`
   → `out.html.rows.json`에 `{header, rows:[{date, desc, amount, card}]}` 생성 (삼성카드 명세서 페이지 기준, '더보기' 전부 펼침).
4. ArtifactData로 `state/cardTx`, `state/cards` 읽기 → `merge-cardtx.py`로 중복 없이 합치기 → `state/cardTx`에 `if_version`으로 set.
5. 처리한 메일에 라벨 `가계부등록` 붙이기, 카카오(PlayMCP 메모)로 결과 통보.

## 준비
```
npm install playwright-core      # chromium은 /opt/pw-browsers/chromium 에 설치돼 있음
```
`vestmail-dec.mjs`는 HTTPS_PROXY 환경변수를 그대로 쓴다 (삼성카드 키 서버와 명세서 페이지에 접속).

## 카드 id (가계부 state/cards)
- 삼성카드 - 미엘: mtsxn7rbhej10 (사용 시작일 14)
- 국민카드 - 미엘: mtsxnswslmbeb (14) · 롯데카드 - 미엘: mtsxnypw40ifd (12)
- 현대카드 - 지순: mtsxo53dk064h (19) · 삼성카드 - 지순: mtsxo9su0w5ch (24) · 하나카드 - 미엘: mu47535i6yh9o (15)
