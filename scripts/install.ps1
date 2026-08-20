#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$installDir = Join-Path $HOME '.theo'
$aliasLine = '. "$HOME/.theo/scripts/alias.ps1"'

function Write-Step($message) {
  Write-Host "> $message"
}

Write-Step 'Installing theo...'

foreach ($tool in @('git', 'node', 'npm')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool is required but was not found in PATH."
  }
}

if (-not (Test-Path $installDir)) {
  Write-Step 'Cloning theo...'
  git clone https://github.com/LeoFalco/theo.git $installDir --depth 1
} else {
  Write-Step 'Updating theo...'
  git -C $installDir fetch --all --quiet
  git -C $installDir reset --hard origin/master --quiet
}

Write-Step 'Installing dependencies...'
Push-Location $installDir
try {
  npm install --omit=dev --no-audit --no-fund
} finally {
  Pop-Location
}

$profileDir = Split-Path -Parent $PROFILE
if (-not (Test-Path $profileDir)) {
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

if (-not (Test-Path $PROFILE)) {
  New-Item -ItemType File -Path $PROFILE | Out-Null
}

if ((Get-Content $PROFILE -Raw) -match '\.theo') {
  Write-Step 'theo already added to the PowerShell profile.'
} else {
  Write-Step 'Adding theo to the PowerShell profile...'
  Add-Content -Path $PROFILE -Value "`n$aliasLine"
}

Write-Step 'theo installed.'
Write-Step 'Restart your terminal to use theo.'
