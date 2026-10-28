#!/usr/bin/env bash
set -euo pipefail

# Run from the yob_frontend repository root.
ROOT="$(pwd)"
BUILD_DIR=""
ZIP_DIR="$ROOT/deploy"
ZIP_FILE="$ZIP_DIR/yob_frontend.zip"

npm ci
npm run build

INDEX_FILE="$(find "$ROOT/dist" -type f -name index.html -print -quit)"
if [ -z "$INDEX_FILE" ]; then
  echo "ERROR: no index.html found under $ROOT/dist" >&2
  exit 1
fi
BUILD_DIR="$(dirname "$INDEX_FILE")"
echo "Using Angular build directory: $BUILD_DIR"

mkdir -p "$ZIP_DIR"
rm -f "$ZIP_FILE"
(
  cd "$BUILD_DIR"
  zip -qr "$ZIP_FILE" .
)

unzip -tq "$ZIP_FILE" >/dev/null
printf 'Created: %s\n' "$ZIP_FILE"
printf 'Next:\n  git add -f deploy/yob_frontend.zip\n  git commit -m "Update yob_frontend deployment build"\n  git push origin main\n'
