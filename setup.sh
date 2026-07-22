#!/usr/bin/env bash
# NOSE — one-shot Codespace setup.
# Unzips the site archive, flattens a wrapper folder if there is one,
# fixes permissions, then runs the manifest check.
#
# Usage:  bash setup.sh
set -uo pipefail
cd "$(dirname "$0")"

zip=$(ls -t ./*.zip 2>/dev/null | head -1)
[ -n "$zip" ] || { echo "No .zip found in this folder. Upload it first."; exit 1; }
echo "==> unpacking $zip"

rm -rf incoming && mkdir incoming
unzip -q "$zip" -d incoming || { echo "FAIL: unzip failed"; exit 1; }

# Most archives wrap everything in a single top-level folder; some do not.
count=$(ls -A incoming | wc -l | tr -d ' ')
inner=$(ls -A incoming | head -1)
if [ "$count" -eq 1 ] && [ -d "incoming/$inner" ]; then
  echo "==> flattening wrapper folder: $inner"
  src="incoming/$inner"
else
  echo "==> archive has no wrapper folder"
  src="incoming"
fi

# The .[!.]* glob matters: a plain mv incoming/* silently leaves dotfiles
# like .nvmrc behind, which fails confusingly much later.
mv "$src"/* . 2>/dev/null
mv "$src"/.[!.]* . 2>/dev/null
rm -rf incoming

chmod +x build.sh verify-manifest.sh setup.sh 2>/dev/null

echo
if [ -f verify-manifest.sh ]; then
  bash verify-manifest.sh .
else
  echo "verify-manifest.sh not found — upload it, then run: bash verify-manifest.sh ."
fi
