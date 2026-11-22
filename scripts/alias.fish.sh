function theo
  set -l bun (command -v bun; or echo ~/.bun/bin/bun)
  $bun --env-file="$HOME/.theo/.env" ~/.theo/src/index.js $argv
end


function theo-update
  curl https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.sh -s | sh
end
