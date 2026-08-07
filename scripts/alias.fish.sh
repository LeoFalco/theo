function theo
  nvm use (cat ~/.theo/.nvmrc) >> /dev/null
  node --no-deprecation ~/.theo $argv
  nvm use &> /dev/null
end


function theo-update
  curl https://raw.githubusercontent.com/LeoFalco/theo/master/scripts/install.sh -s | sh
end
