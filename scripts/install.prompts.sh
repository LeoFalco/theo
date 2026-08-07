#!/usr/bin/env bash

source_dir="$HOME/.theo/prompts"
target_dir="$HOME/.gemini/antigravity/global_workflows"

mkdir -p "$(dirname "$target_dir")"

if test -e "$target_dir"; then
    echo "Warning: Symlink or directory $target_dir already exists. skipping."
else
    ln -s "$source_dir" "$target_dir"
    echo "Symlinked $source_dir to $target_dir"
fi
