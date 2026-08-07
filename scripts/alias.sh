function theo () {
  nvm use $(cat ~/.theo/.nvmrc) >> /dev/null
  node --no-warnings ~/.theo $@
  nvm use &> /dev/null
}

function theo-update () {
  curl https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.sh -s | sh
}
