#!/bin/bash
# ─────────────────────────────────────────────────────────────
# session-start.sh — TEAM TOPS 인트라넷 작업 하네스 (SessionStart 훅)
#
# 웹(Claude Code on the web) 세션이 시작될 때 자동 실행되어,
#   1) Firebase Functions 의존성 설치(유일한 npm 의존성)
#   2) index.html 베이스라인 검증(문법 + 중복 id + 저장패턴) 보고
# 를 수행한다. 검증 결과는 "보고만" 하고 세션 시작을 막지는 않는다.
# (턴 종료마다 도는 Stop 훅 intranet-guard.mjs 와 짝을 이루는 시작측 점검)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# 로컬 세션에서는 건드리지 않는다 — 웹 원격 환경에서만 동작.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

echo "── TEAM TOPS 인트라넷 작업 하네스 ──────────────"

# 1) Firebase Functions 의존성 설치 (있을 때만, 실패해도 세션은 계속)
if [ -f functions/package.json ]; then
  echo "• functions 의존성 설치 중…"
  if npm install --prefix functions --no-audit --no-fund --no-package-lock --loglevel=error; then
    echo "  ✅ functions 의존성 준비 완료"
  else
    echo "  ⚠️ functions 의존성 설치 실패(네트워크?) — index.html 작업에는 영향 없음"
  fi
fi

# 2) index.html 베이스라인 검증 — 문법 + 중복 id + 저장패턴 (보고만, 비차단)
echo "• index.html 베이스라인 검증(문법·중복 id·저장패턴)…"
if node .claude/hooks/intranet-guard.mjs; then
  echo "  ✅ 깨끗함 — 세션을 깨끗한 상태에서 시작합니다"
else
  echo "  ‼️ 가드가 문제를 보고했습니다(위 메시지 참고) — 작업 시작 전 확인 권장"
fi

echo "─────────────────────────────────────────────────"
