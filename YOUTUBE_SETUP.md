# YouTube API 연동 설정 가이드

이 문서는 easycut에서 생성한 영상을 YouTube에 자동으로 게시하는 방법을 설명합니다.

## 1단계: Google Cloud 프로젝트 생성 및 OAuth 설정

### 1.1 Google Cloud Console에 접속
- [Google Cloud Console](https://console.cloud.google.com/)에 접속
- 새로운 프로젝트 생성 (예: "EasyCut YouTube")

### 1.2 YouTube Data API v3 활성화
- 좌측 메뉴에서 "API 및 서비스" → "라이브러리" 클릭
- "YouTube Data API v3" 검색 후 선택
- "사용 설정" 버튼 클릭

### 1.3 OAuth 클라이언트 자격증명 생성
- "API 및 서비스" → "사용자 인증 정보" 클릭
- "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID" 선택
- 애플리케이션 유형: "웹 애플리케이션"
- 승인된 리디렉션 URI:
  ```
  http://localhost:4000/api/youtube/auth/callback
  ```
  (프로덕션 배포 시: `https://yourdomain.com/api/youtube/auth/callback`)

### 1.4 클라이언트 ID와 Secret 저장
생성된 자격증명에서:
- **클라이언트 ID** 복사
- **클라이언트 Secret** 복사

## 2단계: 환경변수 설정

### 로컬 개발 환경
프로젝트 루트 또는 `.env` 파일에 다음을 추가:

```bash
YOUTUBE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret-here
YOUTUBE_REDIRECT_URI=http://localhost:4000/api/youtube/auth/callback
```

### 프로덕션 (Render.com 등)
대시보드의 환경변수 설정에서 위 세 값을 추가하세요.

## 3단계: YouTube 계정 인증

### 3.1 인증 URL 생성
서버가 실행 중인 상태에서:
```bash
curl http://localhost:4000/api/youtube/auth-url
```

응답:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/..."
}
```

### 3.2 브라우저에서 인증
1. 반환된 `authUrl`을 브라우저에서 열기
2. YouTube 계정으로 로그인
3. 권한 허용
4. 리디렉션되어 "YouTube 인증 완료" 메시지 표시

이제 `youtube-tokens.json`에 액세스 토큰이 저장됩니다.

## 4단계: 영상 업로드 테스트

### 4.1 인증 상태 확인
```bash
curl http://localhost:4000/api/youtube/status
```

응답:
```json
{
  "authenticated": true,
  "hasTokens": true
}
```

### 4.2 영상 업로드
```bash
curl -X POST http://localhost:4000/api/youtube/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "video=@path/to/video.mp4" \
  -F "title=테스트 영상" \
  -F "description=테스트 설명" \
  -F "tags=테스트,유튜브"
```

응답:
```json
{
  "ok": true,
  "videoId": "dQw4w9WgXcQ",
  "title": "테스트 영상",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

## 5단계: easycut 통합 (다음 단계)

### 5.1 easycut API에서 영상 다운로드
easycut에서 생성된 영상 URL을 받아서 다음과 같이 처리:

```javascript
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

async function uploadEasycut ToYoutube(easycut Url, title, description) {
  // 1. easycut에서 영상 다운로드
  const response = await fetch(easycut Url);
  const buffer = await response.buffer();
  const filePath = path.join(DATA_DIR, 'uploads', `easycut-${Date.now()}.mp4`);
  fs.writeFileSync(filePath, buffer);

  // 2. YouTube에 업로드
  const formData = new FormData();
  formData.append('video', fs.createReadStream(filePath));
  formData.append('title', title);
  formData.append('description', description);

  const uploadResponse = await fetch('http://localhost:4000/api/youtube/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    },
    body: formData
  });

  return uploadResponse.json();
}
```

## API 엔드포인트 정리

| 엔드포인트 | 메서드 | 설명 | 인증 |
|-----------|--------|------|------|
| `/api/youtube/auth-url` | GET | 인증 URL 생성 | X |
| `/api/youtube/auth/callback` | GET | OAuth 콜백 (브라우저 자동) | X |
| `/api/youtube/status` | GET | 인증 상태 확인 | X |
| `/api/youtube/upload` | POST | 영상 업로드 | O (JWT) |

## 주의사항

1. **프라이버시 설정**: 현재 모든 영상은 `private`로 업로드됩니다. 필요시 `status.privacyStatus`를 `unlisted` 또는 `public`으로 변경하세요.

2. **파일 크기 제한**: 현재 5GB 제한입니다. YouTube 정책에 따라 조정 가능합니다.

3. **토큰 갱신**: 액세스 토큰은 1시간마다 자동으로 갱신됩니다. 리프레시 토큰은 영구적으로 유효합니다.

4. **에러 처리**: 업로드 실패 시 임시 파일이 자동으로 삭제됩니다.

## 문제 해결

### "YouTube 클라이언트가 초기화되지 않았습니다"
- 환경변수 `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` 설정 확인
- 서버 재시작

### "YouTube 인증이 필요합니다"
- `/api/youtube/auth-url`에서 인증 후 다시 시도

### "토큰 획득 실패"
- OAuth 콜백 URL이 Google Cloud에 등록된 값과 일치하는지 확인
- 클라이언트 ID/Secret 재확인
