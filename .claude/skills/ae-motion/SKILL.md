---
name: ae-motion
description: "After Effects용 ExtendScript(JSX) 스크립트로 컴포지션·레이어·키프레임을 자동 생성한다. 'After Effects 스크립트', 'AE 자동화', '.jsx 만들어줘' 요청에 사용."
---

# AE-Motion — JSX 기반 After Effects 스크립트

## 출력 형태
- 단일 `.jsx` 파일. AE에서 `파일 > 스크립트 > 스크립트 파일 실행`.
- 전체를 `app.beginUndoGroup("이름") ... app.endUndoGroup()`으로 감싸 한 번에 되돌릴 수 있게 한다.
- ExtendScript는 ES3 기반: `let/const`, 화살표 함수, 템플릿 문자열을 쓰지 않는다.

## 구조
1. 상수: 폭/높이/fps/길이, 색상(0–1 범위 RGB 배열)
2. 컴프 생성: `app.project.items.addComp(name, w, h, 1, duration, fps)`
3. 레이어: `comp.layers.addText()`, `addShape()`, `addSolid()`
4. 키프레임: `prop.setValueAtTime(t, value)` 후 `setTemporalEaseAtKey`로 이징 지정
5. 순차 등장: 레이어마다 시작 시간을 0.08–0.15초씩 지연

## 규칙
- 속성 경로는 matchName(`"ADBE Transform Group"`)을 사용해 언어판에 상관없이 동작하게 한다.
- 실패 가능 지점은 `try/catch`로 감싸고 `alert()`로 원인을 보여준다.
