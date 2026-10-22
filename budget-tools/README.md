# 가계부 자동 등록 도구

카드사 이메일 명세서를 읽어 우리집 가계부(claude.ai 아티팩트 DB)에 카드 내역을 넣는 스크립트.
예약 작업(Routine)이 매주 실행하며, 사람 손 없이 돌아간다.

## 흐름
1. Gmail에서 최근 명세서 메일 검색 (`subject:명세서 OR subject:이용대금`, 라벨 `가계부등록` 없는 것).
2. `get_message(RAW)` 결과를 파일로 저장 → `extract-mail.py`로 첨부 추출.
3. 첨부가 VestMail 보안 HTML이면 비밀번호로 푼다. 비밀번호는 명세서 주인의 생년월일 6자리 (환경 변수: 노미엘 `BUDGET_STMT_PW`, 박지순 `BUDGET_STMT_PW2`).
   - 삼성카드(billing@samsungcard.com): `node vestmail-dec.mjs <html> <비밀번호> <out.html>` → 삼성 명세서 페이지로 이동해 '더보기'를 전부 펼치고 `out.html.rows.json` 생성.
   - 현대카드(webmaster@hcs.com, 첨부 hyundaicard.html): `node vestmail-open.mjs <html> <비밀번호> <out.html> 'hyundaicard|hcs\.com'` 로 푼 뒤
     `python3 -I hyundai-rows.py <out.html> <연도> <rows.json>` → 일시불만 rows, 장기카드대출 상환은 loans 로 분리(등록하지 않음).
   - 틀린 비밀번호면 dialogs 에 "비밀번호 입력이 잘못되었습니다"가 찍힌다.
4. ArtifactData로 `state/cardTx`, `state/cards` 읽기 → `merge-cardtx.py`로 중복 없이 합치기 → `state/cardTx`에 `if_version`으로 set.
5. 처리한 메일에 라벨 `가계부등록` 붙이기, 카카오(PlayMCP 메모)로 결과 통보.

## 준비
```
npm install playwright-core      # chromium은 /opt/pw-browsers/chromium 에 설치돼 있음
```
`vestmail-dec.mjs`는 HTTPS_PROXY 환경변수를 그대로 쓴다 (삼성카드 키 서버와 명세서 페이지에 접속).

## 청구월
각 카드의 사용 시작일(periodStart) 기준: 시작일 이상이면 다음 달. 현대카드는 결제일이 1일이라 '11월 명세서'로 오지만
가계부 규칙(사용기간 9/19~10/18 → 10월)에 따라 10월로 넣는다. merge-cardtx.py 가 이 계산을 한다.

## 카드 id (가계부 state/cards)
- 삼성카드 - 미엘: mtsxn7rbhej10 (사용 시작일 14)
- 국민카드 - 미엘: mtsxnswslmbeb (14) · 롯데카드 - 미엘: mtsxnypw40ifd (12)
- 현대카드 - 지순: mtsxo53dk064h (19) · 삼성카드 - 지순: mtsxo9su0w5ch (24) · 하나카드 - 미엘: mu47535i6yh9o (15)
