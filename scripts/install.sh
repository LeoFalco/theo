#!/usr/bin/env sh

echo "▷ Installing theo..."

# migrate from the old fc-tools installation
migrate_rc_file() {
  rc_file=$1
  [ -f "$rc_file" ] || return 0
  if grep -q "\.fc-tools" "$rc_file"; then
    echo "▷ Removing old fc-tools entries from $rc_file..."
    sed -i.bak '/\.fc-tools/d' "$rc_file"
    echo "▷ Removed old fc-tools entries from $rc_file (backup at $rc_file.bak)."
  fi
}

migrate_rc_file ~/.bashrc
migrate_rc_file ~/.zshrc
migrate_rc_file ~/.config/fish/config.fish

show_changelog() {
  [ -n "$OLD_HEAD" ] || return 0
  NEW_HEAD=$(git -C ~/.theo rev-parse HEAD)
  [ -z "$NEW_HEAD" ] || [ "$OLD_HEAD" = "$NEW_HEAD" ] && return 0

  echo "▷ What is new in this update:"
  echo

  git -C ~/.theo log --no-merges --format='%s' "$OLD_HEAD..$NEW_HEAD" | awk '
    /^feat/         { feat  = feat  "  * " $0 "\n"; next }
    /^fix/          { fix   = fix   "  * " $0 "\n"; next }
    /^perf/         { perf  = perf  "  * " $0 "\n"; next }
    /^chore\(deps/  { deps  = deps  "  * " $0 "\n"; next }
    /^chore/        { chore = chore "  * " $0 "\n"; next }
    /^docs/         { docs  = docs  "  * " $0 "\n"; next }
                    { other = other "  * " $0 "\n" }
    END {
      if (feat  != "") { print "New functionality:"; printf "%s", feat }
      if (fix   != "") { print "Fixes:";             printf "%s", fix }
      if (perf  != "") { print "Performance:";       printf "%s", perf }
      if (deps  != "") { print "Dependencies:";      printf "%s", deps }
      if (chore != "") { print "Chore:";             printf "%s", chore }
      if (docs  != "") { print "Docs:";              printf "%s", docs }
      if (other != "") { print "Other:";             printf "%s", other }
    }
  '

  echo
  echo "▷ Full changelog: https://github.com/LeoFalco/theo/commits/master"
}

if [ -d ~/.fc-tools ]; then
  echo "▷ The old ~/.fc-tools directory is no longer used and can be removed with 'rm -rf ~/.fc-tools'."
fi

# if theo directory not exists
if [ ! -d ~/.theo ]; then
  echo "▷ Cloning theo..."
  git clone https://github.com/LeoFalco/theo.git ~/.theo --depth 1
  echo "▷ Cloned theo."
else
  echo "▷ theo already cloned."
  cd ~/.theo
  echo "▷ Updating theo..."

  OLD_HEAD=$(git rev-parse HEAD)
  git fetch --all >> /dev/null
  git reset --hard origin/master
  git pull

  echo "▷ Updated theo."
  cd - >> /dev/null
fi

. ~/.nvm/nvm.sh
nvm use $(cat ~/.theo/.nvmrc) || nvm install $(cat ~/.theo/.nvmrc)

cd ~/.theo
echo "▷ Installing dependencies..."
npm install >> /dev/null
echo "▷ Installed dependencies."
git add -A
git reset --hard >> /dev/null
cd - >> /dev/null

show_changelog

if [ -f ~/.bashrc ]; then
  if ! grep -q "\.theo" ~/.bashrc; then
    echo "▷ Adding theo to bashrc..."
    echo "\nsource ~/.theo/scripts/alias.sh" >> ~/.bashrc
    echo "▷ Added theo to bashrc."
  else
    echo "▷ theo already added to bashrc."
  fi
fi

if [ -f ~/.zshrc ]; then
  if ! grep -q "\.theo" ~/.zshrc; then
    echo "▷ Adding theo to zshrc..."
    echo
    echo "\nsource ~/.theo/scripts/alias.sh" >> ~/.zshrc
    echo "▷ Added theo to zshrc."
  else
    echo "▷ theo already added to zshrc."
  fi
fi

if [ -f ~/.config/fish/config.fish ]; then
  if ! grep -q "\.theo" ~/.config/fish/config.fish; then
    echo "▷ Adding theo to fish..."
    echo "\nsource ~/.theo/scripts/alias.fish.sh" >> ~/.config/fish/config.fish
    echo "▷ Added theo to fish."
  else
    echo "▷ theo already added to fish."
  fi
fi

echo "▷ theo installed."
echo "▷ Restart your terminal to use theo."
