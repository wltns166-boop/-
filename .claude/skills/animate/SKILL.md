---
name: animate
description: "미세 전환(micro-transition)의 움직임 곡선을 설계·적용한다. 버튼 hover, 모달 열기/닫기, 목록 등장, 토글 등 작은 UI 전환에 easing·duration을 정할 때 사용. Use for micro-interactions, transitions, easing curves."
---

# Animate — 미세 전환 움직임 곡선

## 기본 원칙
- 목적 없는 움직임은 넣지 않는다. 모든 전환은 "어디서 왔고 어디로 가는지"를 알려줘야 한다.
- `transform`과 `opacity`만 애니메이션한다 (layout 속성 금지 → 리플로우 발생).
- `prefers-reduced-motion: reduce`에서는 이동을 없애고 페이드만 남긴다.

## 시간(duration) 기준
| 전환 종류 | 시간 |
|---|---|
| hover / press 피드백 | 100–150ms |
| 토글, 체크박스, 탭 전환 | 150–200ms |
| 드롭다운, 툴팁, 토스트 등장 | 180–250ms |
| 모달, 시트, 페이지 전환 | 250–350ms |
| 퇴장(exit) | 등장의 약 70% |

## 곡선(easing) 기준
```css
:root {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);      /* 등장: 빠르게 시작, 부드럽게 정지 */
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);       /* 퇴장: 천천히 시작, 빠르게 사라짐 */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* 화면 안에서 위치 이동 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);/* 살짝 튕기는 강조 (남용 금지) */
}
```
- 등장 = ease-out, 퇴장 = ease-in, 화면 안 이동 = ease-in-out. `linear`는 회전·진행바에만.

## 작업 절차
1. 대상 요소와 트리거(hover/click/mount/unmount)를 목록화한다.
2. 위 표에서 duration, easing을 고른다. 이동 거리는 4–16px 이내로 작게.
3. 목록 등장은 stagger 30–50ms, 최대 6개까지만 지연 누적.
4. reduced-motion 대응 코드를 함께 작성한다.
5. 실제 브라우저에서 확인: 끊김, 깜빡임, 레이아웃 흔들림이 없는지.
