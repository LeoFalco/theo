function theo {
  $bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
  if (-not $bun) { $bun = Join-Path $HOME '.bun\bin\bun.exe' }
  & $bun "--env-file=$HOME/.theo/.env" "$HOME/.theo/src/index.js" @args
}

function theo-update {
  Invoke-RestMethod https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.ps1 | Invoke-Expression
}
