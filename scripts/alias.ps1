function theo {
  if ($env:THEO_RUNTIME -eq 'node') {
    node --no-warnings "$HOME/.theo" @args
    return
  }
  $bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
  if (-not $bun) { $bun = Join-Path $HOME '.bun\bin\bun.exe' }
  & $bun --no-env-file "$HOME/.theo/src/index.js" @args
}

function theo-update {
  Invoke-RestMethod https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.ps1 | Invoke-Expression
}
