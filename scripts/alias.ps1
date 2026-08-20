function theo {
  node --no-warnings "$HOME/.theo" @args
}

function theo-update {
  Invoke-RestMethod https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.ps1 | Invoke-Expression
}
