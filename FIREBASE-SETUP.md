# Firebase 연동 설정 안내

`insurance-intranet-v2.html`은 이제 데이터를 **Firebase(Firestore + Storage)** 에 저장합니다.
기기에 상관없이 같은 데이터를 보고, 청구 서류 파일을 실제로 업로드할 수 있습니다.

- **DB(Firestore)**: 모든 데이터(`customers`, `claims`, ...)를 `appdata` 컬렉션에 키별 문서로 미러링
- **Storage**: 청구 서류 파일을 `claims/<청구번호>/<파일>` 경로에 업로드
- 연결 실패 시 자동으로 기존처럼 **로컬(localStorage) 모드**로 동작합니다.

프로젝트: `team-tops-intranet`

---

## 1. Firestore / Storage 사용 설정 (이미 했다면 건너뛰기)

Firebase 콘솔에서:
- **Firestore Database** → 데이터베이스 만들기 (지역 예: `asia-northeast3`)
- **Storage** → 시작하기

## 2. 보안 규칙 적용 ⚠️ 중요

> 현재 앱 로그인은 자체 `USERS` 계정이라 **Firebase 인증과 연결되어 있지 않습니다.**
> 아래 규칙은 "동작 우선" 버전으로, **이 설정값을 아는 사람은 누구나 읽고 쓸 수 있습니다.**
> 사내 테스트/소규모 운영에는 쓸 수 있지만, 외부에 공개되는 서비스라면
> **Firebase Authentication 연동(다음 단계)** 으로 잠가야 합니다.

### Firestore 규칙
콘솔 → Firestore Database → **규칙(Rules)** 탭에 붙여넣고 게시:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // appdata 컬렉션만 허용 (인트라넷 데이터 미러)
    match /appdata/{key} {
      allow read, write: if true;
    }
  }
}
```

### Storage 규칙
콘솔 → Storage → **규칙(Rules)** 탭에 붙여넣고 게시
(청구 서류 폴더만, 20MB 이하, 이미지·PDF만 허용):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /claims/{claimId}/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 20 * 1024 * 1024
                   && (request.resource.contentType.matches('image/.*')
                       || request.resource.contentType == 'application/pdf');
    }
  }
}
```

## 3. (선택) 보안 강화 — 나중에 권장

진짜로 잠그려면 **Firebase Authentication** 을 연동하고 규칙을
`allow read, write: if request.auth != null;` 로 바꿉니다.
자체 `USERS` 로그인을 Firebase Auth(이메일/비밀번호)로 옮기는 작업이 필요하며,
원하시면 이어서 작업할 수 있습니다.

---

## 동작 방식 요약

| 상황 | 동작 |
|---|---|
| 로그인 | Firestore `appdata`에서 최신 데이터를 내려받아 화면에 반영 |
| 저장(고객/청구/공지 등) | localStorage에 쓰고 Firestore에도 자동 미러 |
| 청구 서류 첨부 | 파일을 Storage에 업로드하고 다운로드 URL을 청구 데이터에 저장 |
| 인터넷/Firebase 불가 | 경고 후 기존 localStorage 모드로 계속 동작 |
