function theo () {
  if [ "$THEO_RUNTIME" = "node" ]; then
    nvm use $(cat ~/.theo/.nvmrc) >> /dev/null
    node --no-warnings ~/.theo "$@"
    nvm use &> /dev/null
    return
  fi
  "$(command -v bun || echo ~/.bun/bin/bun)" --no-env-file ~/.theo/src/index.js "$@"
}

function theo-update () {
  curl https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.sh -s | sh
}
