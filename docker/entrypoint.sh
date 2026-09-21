#!/bin/sh
# Keeps node_modules (a named volume) in sync with package-lock.json.
set -e
cd /app
STAMP=node_modules/.quotlyn-lock-hash
CURRENT=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$CURRENT" ]; then
  echo "[quotlyn] dependencies changed, running npm ci…"
  npm ci
  echo "$CURRENT" > "$STAMP"
fi
exec "$@"
