---
name: nano-banana
description: "터미널에서 Google Gemini 이미지 모델(Nano Banana)로 이미지를 생성·편집한다. GEMINI_API_KEY 환경변수가 필요. '이미지 만들어줘(터미널)', 'nano banana로 생성' 요청에 사용."
---

# Nano-Banana — 터미널에서 이미지 생성

## 전제 조건
- 환경변수 `GEMINI_API_KEY`가 있어야 한다. 없으면 생성하지 말고 사용자에게 키 설정을 안내한다 (키를 채팅에 붙여넣으라고 하지 않는다).
- 프롬프트는 `banana-claude` 스킬의 5요소 공식으로 먼저 작성한다.

## 생성 명령
```bash
MODEL="gemini-2.5-flash-image"   # 최신 이미지 모델명은 공식 문서에서 확인
curl -s "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" \
  -d "$(jq -n --arg p "$PROMPT" '{contents:[{parts:[{text:$p}]}]}')" \
| jq -r '.candidates[0].content.parts[] | select(.inlineData) | .inlineData.data' \
| head -1 | base64 -d > output.png
```

## 편집(기존 이미지 + 지시)
`parts`에 `{"inlineData":{"mimeType":"image/png","data":"<base64>"}}`를 지시문과 함께 넣는다.

## 규칙
- 결과 파일을 열어 실제로 이미지가 생성됐는지 확인한 뒤 보고한다. 오류 JSON이면 메시지를 그대로 전달한다.
- 파일명은 내용을 알 수 있게 짓고, 덮어쓰기 전에 기존 파일을 확인한다.
