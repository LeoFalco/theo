#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$sourceDir = Join-Path $HOME '.theo/prompts'
$targetDir = Join-Path $HOME '.gemini/antigravity/global_workflows'

if (-not (Test-Path $sourceDir)) {
  throw "Source directory $sourceDir does not exist. Run scripts/install.ps1 first."
}

New-Item -ItemType Directory -Path (Split-Path -Parent $targetDir) -Force | Out-Null

if (Test-Path $targetDir) {
  Write-Host "Warning: $targetDir already exists. skipping."
} else {
  New-Item -ItemType Junction -Path $targetDir -Target $sourceDir | Out-Null
  Write-Host "Linked $sourceDir to $targetDir"
}
