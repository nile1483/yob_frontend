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

cleanup() {
  rm -rf "$STAGE"
  rm -f "$ZIP"
}
trap cleanup EXIT

# Prefer authenticated GitHub CLI so the same script works if the repo is private.
# For a public repo, it falls back to raw.githubusercontent.com when gh is not authenticated.
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Downloading $REMOTE_PATH from GitHub using authenticated gh..."
  gh api \
    -H "Accept: application/vnd.github.raw" \
    "repos/$REPO/contents/$REMOTE_PATH?ref=$REF" \
    > "$ZIP"
else
  echo "GitHub CLI is not authenticated; trying public raw URL..."
  if ! curl -fL \
    "https://raw.githubusercontent.com/$REPO/$REF/$REMOTE_PATH" \
    -o "$ZIP"; then
    echo "ERROR: download failed. If the repository is private, run: gh auth login" >&2
    exit 1
  fi
fi

# Refuse to touch the live dist unless the download is a valid storefront ZIP.
unzip -tq "$ZIP" >/dev/null
unzip -q "$ZIP" -d "$STAGE"
test -f "$STAGE/index.html" || {
  echo "ERROR: ZIP does not contain index.html at its root" >&2
  exit 1
}

# Deploy without exposing a half-written index.html:
# 1) copy new hashed assets, 2) atomically replace index.html, 3) remove obsolete files.
rsync -a --exclude='index.html' "$STAGE/" "$LIVE/"
cp "$STAGE/index.html" "$LIVE/index.html.new"
mv -f "$LIVE/index.html.new" "$LIVE/index.html"
rsync -a --delete "$STAGE/" "$LIVE/"

trap - EXIT
cleanup

echo "yob_frontend deployed successfully to $LIVE"
