# 설치된 스킬 목록

이미지의 42개 스킬을 이 폴더(`.claude/skills/`)에 설치했습니다. 이 저장소에서 Claude Code를 열면 자동으로 인식됩니다.

- **원본** = 공개 저장소에서 그대로 가져옴 (폴더 안 `LICENSE.txt` 참고)
- **직접 작성** = 같은 이름의 공개 원본을 찾지 못해, 이미지 설명에 맞춰 새로 작성함
- **다른 방식** = 스킬이 아니라 MCP 서버/플러그인으로 설치해야 하는 것

## 레이어 1: 프론트엔드 & UI 디자인

| # | 이름 | 설치 위치 | 구분 |
|---|---|---|---|
| 01 | frontend-design | `frontend-design/` | 원본 (anthropics/skills) |
| 02 | impeccable | `impeccable/` | 원본 (pbakaus/impeccable) |
| 03 | taste-skill | `taste-skill/` (스킬 이름: design-taste-frontend) | 원본 (Leonxlnx/taste-skill) |
| 04 | animate | `animate/` | 직접 작성 (impeccable 안에도 animate 명령 있음) |
| 05 | design-motion | `design-motion-principles/` | 원본 (kylezantos/design-motion-principles) |
| 06 | theme-factory | `theme-factory/` | 원본 (anthropics/skills) |
| 07 | figma-implement | — | 다른 방식: Figma 플러그인 (Figma 로그인 필요) |
| 08 | playwright-mcp | 저장소 루트 `.mcp.json` | 다른 방식: MCP 서버 |
| 09 | brandkit | `brandkit/` | 직접 작성 |
| 10 | designer-skills | `handoff-spec/` | 원본 (Owl-Listener/designer-skills 중 개발 전달 명세) |

## 레이어 2: 이미지·그래픽·영상

| # | 이름 | 설치 위치 | 구분 |
|---|---|---|---|
| 11 | nano-banana | `nano-banana/` | 직접 작성 (`GEMINI_API_KEY` 필요) |
| 12 | banana-claude | `banana-claude/` | 직접 작성 |
| 13 | canvas-design | `canvas-design/` | 원본 (anthropics/skills) |
| 14 | algorithmic-art | `algorithmic-art/` | 원본 (anthropics/skills) |
| 15 | remotion-superpowers | `remotion-*/` 12개 | 원본 (remotion-dev/skills) |
| 16 | claude-remotion | `remotion-*/` (15번과 같음) | 원본 (remotion-dev/skills) |
| 17 | blender-motion | `blender-motion/` | 직접 작성 |
| 18 | ae-motion | `ae-motion/` | 직접 작성 |

## 레이어 3 & 4: 제품·인터랙션

| # | 이름 | 설치 위치 | 구분 |
|---|---|---|---|
| 19 | hi-fi-mockups | `hi-fi-mockups/` | 직접 작성 |
| 20 | brandkit-sync | `brandkit-sync/` | 직접 작성 |
| 21 | slide-decks | — | 이미 있는 pptx 스킬 사용 |
| 22 | figma-mcp | — | 다른 방식: Figma 플러그인 (07번과 같음) |
| 23 | token-budgets | `token-budgets/` | 직접 작성 |
| 24 | turn-repair | `turn-repair/` | 직접 작성 |
| 25 | generative-ui | `generative-ui/` | 직접 작성 |
| 26 | progressive-reveal | `progressive-reveal/` | 직접 작성 |
| 27 | frustration-checks | `frustration-checks/` | 직접 작성 |
| 28 | feedback-loops | `feedback-loops/` | 직접 작성 |

## 레이어 5: 행동·프롬프트

| # | 이름 | 설치 위치 | 구분 |
|---|---|---|---|
| 29 | system-structure | `system-structure/` | 직접 작성 |
| 30 | persona-architecture | `persona-architecture/` | 직접 작성 |
| 31 | tone-calibration | `tone-calibration/` | 직접 작성 |
| 32 | emotional-design | `emotional-design/` | 직접 작성 |
| 33 | template-design | `template-design/` | 직접 작성 |
| 34 | few-shot-patterns | `few-shot-patterns/` | 직접 작성 |
| 35 | chain-of-thought | `chain-of-thought/` | 직접 작성 |
| 36 | constraint-spec | `constraint-spec/` | 직접 작성 |

## 레이어 6: 신뢰·평가

| # | 이름 | 설치 위치 | 구분 |
|---|---|---|---|
| 37 | guardrails | `guardrails/` | 직접 작성 |
| 38 | trust-calibration | `trust-calibration/` | 직접 작성 |
| 39 | transparency-patterns | `transparency-patterns/` | 직접 작성 |
| 40 | quality-rubrics | `quality-rubrics/` | 직접 작성 |
| 41 | task-decomposition | `task-decomposition/` | 직접 작성 |
| 42 | handoff-protocols | `handoff-protocols/` | 직접 작성 |
