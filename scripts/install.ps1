#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$installDir = Join-Path $HOME '.theo'
$aliasLine = '. "$HOME/.theo/scripts/alias.ps1"'

function Write-Step($message) {
  Write-Host "> $message"
}

function Show-Changelog([string]$installDir, [string]$oldHead) {
  if (-not $oldHead) { return }
  $newHead = git -C $installDir rev-parse HEAD
  if ($newHead -eq $oldHead) { return }

  Write-Step 'What is new in this update:'
  ''

  $commits = git -C $installDir log --no-merges --format='%s' "$oldHead..$newHead"
  $groups = [ordered]@{
    'New functionality' = @()
    Fixes               = @()
    Performance         = @()
    Dependencies        = @()
    Chore               = @()
    Docs                = @()
    Other               = @()
  }

  foreach ($commit in $commits) {
    if ($commit -match '^feat') { $groups['New functionality'] += $commit }
    elseif ($commit -match '^fix') { $groups.Fixes += $commit }
    elseif ($commit -match '^perf') { $groups.Performance += $commit }
    elseif ($commit -match '^chore\(deps') { $groups.Dependencies += $commit }
    elseif ($commit -match '^chore') { $groups.Chore += $commit }
    elseif ($commit -match '^docs') { $groups.Docs += $commit }
    else { $groups.Other += $commit }
  }

  foreach ($key in $groups.Keys) {
    if ($groups[$key].Count -gt 0) {
      Write-Host "$key:"
      foreach ($commit in @($groups[$key])) { Write-Host "  * $commit" }
      Write-Host ''
    }
  }

  Write-Step 'Full changelog: https://github.com/LeoFalco/theo/commits/master'
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
  [string]$oldHead = git -C $installDir rev-parse HEAD
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

Show-Changelog $installDir $oldHead

Write-Step 'theo installed.'
Write-Step 'Restart your terminal to use theo.'
