#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# google-drive-sync.gs 를 구글 Apps Script 웹앱으로 자동 배포한다.
# (clasp = 구글 공식 Apps Script CLI 사용. 기존 /exec URL 을 그대로 유지한다.)
#
# 처음 1회만 준비:
#   1) Node 설치되어 있어야 함 (node -v)
#   2) clasp 로그인:           npx --yes @google/clasp login
#   3) Apps Script API 켜기:   https://script.google.com/home/usersettings (사용 ON)
#   4) 저장소 루트에 .clasp.json 만들기:
#        { "scriptId": "여기에_스크립트_ID" }
#      (scriptId 는 Apps Script 편집기 → 프로젝트 설정 ⚙️ → '스크립트 ID')
#   5) (선택) 기존 웹앱 배포 URL 유지하려면 .gs-deployment-id 파일에 배포 ID 한 줄.
#        배포 ID 확인:  npx --yes @google/clasp deployments
#
# 그 다음부터는 이 스크립트 한 번이면 끝:
#   ./deploy-gs.sh
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/google-drive-sync.gs"
STAGE="$DIR/.gs-deploy"
CLASP="npx --yes @google/clasp"

[ -f "$SRC" ] || { echo "❌ google-drive-sync.gs 가 없습니다."; exit 1; }
[ -f "$DIR/.clasp.json" ] || { echo "❌ .clasp.json (scriptId) 가 없습니다. 스크립트 상단 안내 참고."; exit 1; }

echo "▶ 스테이징 준비..."
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp "$SRC" "$STAGE/Code.gs"
cp "$DIR/apps-script/appsscript.json" "$STAGE/appsscript.json"
# .clasp.json 안의 scriptId 만 사용(rootDir 은 현재 폴더로 고정)
node -e "const j=require('$DIR/.clasp.json'); require('fs').writeFileSync('$STAGE/.clasp.json', JSON.stringify({scriptId:j.scriptId, rootDir:'$STAGE'}));"

cd "$STAGE"
echo "▶ 코드 업로드(clasp push)..."
$CLASP push -f

DEPLOY_ID="$(cat "$DIR/.gs-deployment-id" 2>/dev/null || true)"
echo "▶ 웹앱 배포(clasp deploy)..."
if [ -n "$DEPLOY_ID" ]; then
  $CLASP deploy -i "$DEPLOY_ID" -d "auto deploy $(date +%Y-%m-%d_%H:%M)"
  echo "✅ 기존 배포($DEPLOY_ID) 갱신 완료 — /exec URL 그대로 유지됩니다."
else
  $CLASP deploy -d "auto deploy $(date +%Y-%m-%d_%H:%M)"
  echo "⚠️  새 배포를 만들었습니다. 새 /exec URL 이 생겼을 수 있으니,"
  echo "    'npx --yes @google/clasp deployments' 로 배포 ID 를 확인해"
  echo "    .gs-deployment-id 파일에 적어두면 다음부터 URL 이 유지됩니다."
fi
echo "🎉 배포 끝."
