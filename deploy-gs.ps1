# ──────────────────────────────────────────────────────────────────────────────
# TEAM TOPS — 앱스크립트(google-drive-sync.gs) 수동 배포  [윈도우 PowerShell]
#
# GitHub Actions(자동 배포)가 막혀 있을 때, 내 PC에서 바로 배포하는 우회로.
# 이미 `npx --yes @google/clasp@2.4.2 login` 을 해둔 PC에서만 동작한다.
#
# 사용법
#   1) 이 파일과 함께 google-drive-sync.gs, appsscript.json 을 같은 폴더에 둔다
#   2) 그 폴더에서 마우스 오른쪽 → "PowerShell에서 실행" 또는:
#        powershell -ExecutionPolicy Bypass -File .\deploy-gs.ps1
#   3) 스크립트 ID를 물어보면 붙여넣기 (Apps Script 편집기 → 프로젝트 설정 ⚙️ → 스크립트 ID)
#
# 기존 배포 ID 를 갱신하므로 /exec 주소는 그대로 유지된다.
# 마지막에 ?ping=1 로 라이브 서버 버전을 직접 확인한다.
# ──────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$deployId = 'AKfycbwpknpHr2g8xh1C0gP7Bo6fR7PxpCarjTvQuSUys_5DTXMxNkDASGfOkSktDqpjdDU2'
$src      = Join-Path $here 'google-drive-sync.gs'
$manifest = Join-Path $here 'appsscript.json'

function Fail($msg) { Write-Host ""; Write-Host "X $msg" -ForegroundColor Red; Read-Host "엔터를 누르면 닫힙니다"; exit 1 }

if (-not (Test-Path $src))      { Fail "google-drive-sync.gs 가 이 폴더에 없습니다: $here" }
if (-not (Test-Path $manifest)) { Fail "appsscript.json 이 이 폴더에 없습니다: $here" }

# clasp 로그인 확인
if (-not (Test-Path (Join-Path $env:USERPROFILE '.clasprc.json'))) {
  Fail "clasp 로그인이 안 돼 있습니다. 먼저 실행하세요:`n    npx --yes @google/clasp@2.4.2 login"
}

# 스크립트 ID (환경변수 GS_SCRIPT_ID 있으면 그걸 쓰고, 없으면 물어봄)
$scriptId = $env:GS_SCRIPT_ID
if ([string]::IsNullOrWhiteSpace($scriptId)) {
  $scriptId = Read-Host '스크립트 ID (Apps Script 편집기 -> 프로젝트 설정 -> 스크립트 ID)'
}
$scriptId = $scriptId.Trim()
if ($scriptId.Length -lt 20) { Fail "스크립트 ID 가 이상합니다: '$scriptId'" }

# 스테이징 폴더 준비 (Code.gs + appsscript.json + .clasp.json)
$stage = Join-Path $here '.gs-deploy'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item $src      (Join-Path $stage 'Code.gs')        -Force
Copy-Item $manifest (Join-Path $stage 'appsscript.json') -Force
'{ "scriptId": "' + $scriptId + '", "rootDir": "." }' |
  Set-Content -Path (Join-Path $stage '.clasp.json') -Encoding ascii

Push-Location $stage
try {
  Write-Host "> 코드 업로드(clasp push)..." -ForegroundColor Cyan
  & npx --yes @google/clasp@2.4.2 push -f
  if ($LASTEXITCODE -ne 0) { Fail "clasp push 실패 — Apps Script API 가 켜져 있는지 확인하세요: https://script.google.com/home/usersettings" }

  Write-Host "> 기존 배포 갱신(clasp deploy — /exec 주소 유지)..." -ForegroundColor Cyan
  & npx --yes @google/clasp@2.4.2 deploy -i $deployId -d "manual deploy"
  if ($LASTEXITCODE -ne 0) { Fail "clasp deploy 실패 — 배포 ID 가 이 스크립트의 것이 맞는지 확인하세요." }
} finally { Pop-Location }

# 라이브 확인 — ?ping=1 응답의 version 이 소스의 SERVER_VERSION 과 같아야 성공
$want = ([regex]"SERVER_VERSION\s*=\s*'([^']+)'").Match((Get-Content $src -Raw)).Groups[1].Value
Write-Host "> 라이브 확인 (기대 버전: $want)..." -ForegroundColor Cyan
$got = ''
foreach ($i in 1..6) {
  try {
    $res = Invoke-WebRequest -Uri "https://script.google.com/macros/s/$deployId/exec?ping=1" -UseBasicParsing -TimeoutSec 30
    $m = ([regex]'"version"\s*:\s*"([^"]+)"').Match($res.Content)
    if ($m.Success) { $got = $m.Groups[1].Value }
    if ($got -eq $want) { break }
    if ($res.Content -match 'accounts\.google\.com|ServiceLogin') {
      Fail "웹앱이 로그인 페이지를 돌려줍니다 — 배포의 '액세스 권한'이 '모든 사용자'가 아닙니다.`n    Apps Script 편집기 -> 배포 -> 배포 관리 -> 연필(수정) -> 액세스 권한: 모든 사용자 -> 배포"
    }
  } catch { }
  Write-Host "  ...반영 대기 ($i/6)"
  Start-Sleep -Seconds 5
}

Write-Host ""
if ($got -eq $want) {
  Write-Host "OK 배포 완료 — 라이브 서버 버전 $got" -ForegroundColor Green
  Write-Host "   이제 드라이브에서 기존 고객 보장분석표 파일을 지우고 [작성]을 다시 눌러 확인하세요."
} else {
  Write-Host "! 배포 명령은 끝났지만 라이브 버전이 다릅니다 (기대 $want / 실제 $(if($got){$got}else{'응답없음'}))" -ForegroundColor Yellow
  Write-Host "   배포 ID 가 인트라넷이 쓰는 /exec 주소의 것이 맞는지 확인하세요."
}
Read-Host "엔터를 누르면 닫힙니다"
