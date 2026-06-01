# Firebase 연동 설정 안내

`insurance-intranet-v2.html`은 데이터를 **Firebase**에 저장하고, **로그인한 팀원만** 접근할 수 있도록
**Firebase Authentication**으로 보호합니다.

- **인증(Auth)**: 아이디/비밀번호 로그인 (내부적으로 `<아이디>@teamtops.local` 이메일로 처리 — 팀원은 이메일 몰라도 됨)
- **DB(Firestore)**: 모든 데이터를 `appdata` 컬렉션에 키별 문서로 미러링
- **Storage**: 청구 서류 파일을 `claims/<청구번호>/<파일>` 경로에 업로드
- 연결 실패 시: 코드에 있는 기본 계정만 **로컬 모드**(이 기기 한정, 클라우드 데이터 접근 불가)로 동작

프로젝트: `team-tops-intranet`

---

## ⭐ 설정 순서 (이 순서대로 하세요)

### 1. 로그인(인증) 켜기
콘솔 → **Authentication → Sign-in method(로그인 방법)** → **이메일/비밀번호** 사용 설정(Enable) → 저장

### 2. 관리자 계정 1개를 콘솔에서 직접 만들기 (최초 1회)
콘솔 → **Authentication → Users → Add user(사용자 추가)**
- 이메일: `admin@teamtops.local`
- 비밀번호: 원하는 관리자 비밀번호 (6자 이상)

> 이 계정이 앱에서 아이디 `admin` 으로 로그인하는 관리자입니다.
> (이후 다른 팀원은 콘솔에 들어올 필요 없이 **앱 안에서** 추가합니다.)

### 3. Firestore / Storage 사용 설정
- **Firestore Database** → 데이터베이스 만들기 (지역 예: `asia-northeast3` 서울)
- **Storage** → 시작하기

### 4. 보안 규칙 적용 (로그인한 사람만 허용)

**Firestore** (콘솔 → Firestore Database → 규칙):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appdata/{key} {
      allow read, write: if request.auth != null;   // 로그인한 팀원만
    }
  }
}
```

**Storage** (콘솔 → Storage → 규칙):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /claims/{claimId}/{fileName} {
      allow read, write: if request.auth != null
                         && request.resource.size < 20 * 1024 * 1024
                         && (request.resource.contentType.matches('image/.*')
                             || request.resource.contentType == 'application/pdf');
    }
  }
}
```

### 5. 앱에서 관리자로 로그인 → 팀원 추가
1. 앱에서 아이디 `admin` + (2번에서 정한 비밀번호)로 로그인
2. **관리자 패널 → 👤 팀원 계정 관리** 에서 아이디·이름·부서·권한·비밀번호 입력 → **팀원 계정 생성**
3. 팀원은 그 아이디·비밀번호로 어느 기기에서든 로그인하면 같은 데이터를 봅니다

---

## 계정 관리 동작

| 기능 | 동작 |
|---|---|
| 팀원 추가 | 앱에서 Firebase 계정 생성 + 프로필을 클라우드에 저장 |
| 비활성화 | 해당 계정의 로그인을 막음 (목록에서 "비활성화" 클릭) |
| 완전 삭제 | 로그인 자체를 영구 삭제하려면 콘솔 → Authentication → Users 에서 해당 사용자 삭제 |

## ⚠️ 보안 한계 (꼭 알아두세요)

지금 방식은 **백엔드(Cloud Functions) 없이 브라우저만으로** 동작합니다. 그래서:
- 팀원 계정 생성은 "회원가입" API를 쓰는데, 이론상 이 페이지를 가진 사람이 임의로 계정을 만들 수도 있습니다.
- 따라서 **앱 주소(URL)를 팀 외부에 공개하지 마세요.** 사내/공유 링크 정도로만 쓰는 게 안전합니다.
- 더 강하게 잠그려면(외부인이 가입 자체를 못 하게) **Cloud Functions + Admin SDK**로 계정 생성을 서버에서만 하도록 바꿔야 합니다. 필요하면 이어서 작업할 수 있습니다.

데이터 자체(Firestore/Storage)는 **로그인하지 않으면 읽기/쓰기 모두 차단**되므로, 위 규칙만 적용하면 외부인이 데이터를 보거나 바꿀 수는 없습니다.

---

## 동작 방식 요약

| 상황 | 동작 |
|---|---|
| 로그인 | Firebase 인증 통과 시 클라우드 데이터 접근, 실패 시 기본 계정은 로컬 모드 |
| 저장 | localStorage에 쓰고 Firestore에도 자동 미러 |
| 청구 서류 첨부 | 파일을 Storage에 업로드하고 다운로드 URL을 청구 데이터에 저장 |
| 다른 기기 로그인 | 클라우드에서 최신 데이터를 내려받아 동일하게 표시 |
