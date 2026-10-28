#!/usr/bin/env bash
set -euo pipefail

REPO="nile1483/yob_frontend"
REF="main"
REMOTE_PATH="deploy/yob_frontend.zip"
BASE="/srv/projects/shayona360/yob_frontend"
LIVE="$BASE/dist"
STAGE="$BASE/.dist-new"
ZIP="/tmp/yob_frontend.zip"

mkdir -p "$LIVE"
rm -rf "$STAGE"
mkdir -p "$STAGE"
rm -f "$ZIP"

# Works for public repos; if the repo later becomes private, authenticate once with: gh auth login
gh api \
  -H "Accept: application/vnd.github.raw+json" \
  "repos/$REPO/contents/$REMOTE_PATH?ref=$REF" \
  > "$ZIP"

unzip -tq "$ZIP" >/dev/null
unzip -q "$ZIP" -d "$STAGE"
test -f "$STAGE/index.html" || {
  echo "ERROR: ZIP does not contain index.html at its root" >&2
  exit 1
}

# Copy new hashed assets first while leaving old assets in place, switch index.html,
# then remove files that are no longer part of the new build.
rsync -a --exclude='index.html' "$STAGE/" "$LIVE/"
cp "$STAGE/index.html" "$LIVE/index.html.new"
mv -f "$LIVE/index.html.new" "$LIVE/index.html"
rsync -a --delete "$STAGE/" "$LIVE/"

rm -rf "$STAGE"
rm -f "$ZIP"

echo "yob_frontend deployed successfully to $LIVE"
