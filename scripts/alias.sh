function theo () {
  "$(command -v bun || echo ~/.bun/bin/bun)" --env-file="$HOME/.theo/.env" ~/.theo/src/index.js "$@"
}

function theo-update () {
  curl https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.sh -s | sh
}
