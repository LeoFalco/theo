function theo
  if test "$THEO_RUNTIME" = node
    nvm use (cat ~/.theo/.nvmrc) >> /dev/null
    node --no-deprecation ~/.theo $argv
    nvm use &> /dev/null
    return
  end
  set -l bun (command -v bun; or echo ~/.bun/bin/bun)
  $bun --no-env-file ~/.theo/src/index.js $argv
end


function theo-update
  curl https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.sh -s | sh
end
