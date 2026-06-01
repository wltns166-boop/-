# 자동 배포 설정 가이드 (Firebase Hosting)

이 저장소는 **`main` 또는 `claude/*` 브랜치에 푸시되면 GitHub Actions가 자동으로
Firebase Hosting에 `index.html`을 배포**하도록 설정되어 있습니다.
한 번만 아래 설정을 마치면, 이후로는 코드를 수정해 푸시할 때마다 팀원 전체가
같은 주소에서 최신 버전을 보게 됩니다.

- 배포 주소: `https://team-tops-intranet.web.app`
- 배포를 담당하는 워크플로: `.github/workflows/firebase-deploy.yml`

---

## 1단계. Firebase 서비스 계정 키 만들기 (필수, 1회)

GitHub Actions가 내 Firebase 프로젝트에 배포할 수 있도록 "열쇠"를 만들어 줍니다.

1. https://console.firebase.google.com → **team-tops-intranet** 프로젝트 선택
2. 좌측 상단 톱니바퀴 ⚙️ → **프로젝트 설정** → **서비스 계정** 탭
3. **새 비공개 키 생성** 클릭 → JSON 파일이 다운로드됩니다. (이 파일은 비밀번호처럼 취급, 외부 공유 금지)

## 2단계. GitHub에 비밀값 등록 (필수, 1회)

1. GitHub 저장소 페이지 → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** 클릭
3. 이름(Name): `FIREBASE_SERVICE_ACCOUNT`
4. 값(Secret): 1단계에서 받은 **JSON 파일 내용 전체**를 복사해 붙여넣기
5. **Add secret** 저장

> 여기까지 하면 **HTML 자동 배포가 완료**됩니다. 아무 파일이나 수정해 푸시하면
> 몇 분 내로 `team-tops-intranet.web.app`에 반영됩니다.
> (수동 실행도 가능: GitHub → **Actions** 탭 → Deploy to Firebase → **Run workflow**)

---

## 3단계. (선택) AI 보장분석 기능 살리기 — `/api/analyze`

보장분석의 AI 분석은 Claude API를 호출하는 백엔드(`/api/analyze`)가 필요합니다.
이 기능까지 쓰려면 아래를 추가로 설정하세요. (안 하면 AI 분석만 동작하지 않고 나머지는 정상)

1. **Firebase 요금제를 Blaze(종량제)로 업그레이드** — Cloud Functions는 Blaze 플랜에서만 동작합니다.
   (소규모 사용량은 거의 무료 수준이지만 카드 등록이 필요합니다.)
2. **Anthropic API 키를 Firebase 시크릿으로 등록** — 로컬 PC에서 한 번만 실행:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase functions:secrets:set ANTHROPIC_API_KEY
   # 프롬프트가 뜨면 sk-ant-... 로 시작하는 키를 붙여넣기
   ```
3. 이후 푸시하면 워크플로의 "Deploy Functions" 단계에서 함수까지 자동 배포됩니다.

> 함수 코드는 `functions/index.js`에 있으며, API 키는 브라우저에 노출되지 않고
> 서버에서만 사용됩니다.

---

## 참고

- `insurance-intranet-v2.html`(구버전)은 배포에서 제외됩니다(`firebase.json`의 ignore).
- 데이터(공지·팀원·청구 등)는 이미 Firestore로 실시간 동기화되고, 청구서류 파일은
  Firebase Storage로 공유됩니다. 이번 설정은 **HTML 화면(코드) 자체**를 팀원에게
  자동 배포하기 위한 것입니다.
