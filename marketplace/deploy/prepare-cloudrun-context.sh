#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$ROOT/marketplace/upstream/lancy/backend"
if [[ "$#" -ne 1 ]]; then echo "Usage: $0 /absolute/empty-build-context-directory" >&2; exit 2; fi
DEST="$1"
case "$DEST" in /*) ;; *) echo "Context path must be absolute" >&2; exit 2;; esac
if [[ -e "$DEST" ]] && [[ -n "$(find "$DEST" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing to overwrite nonempty context: $DEST" >&2; exit 2
fi
[[ -f "$SOURCE/src/managed/managed.service.ts" ]] || { echo "Apply overlay first" >&2; exit 1; }
[[ -f "$SOURCE/src/documents/private-vault.store.ts" ]] || { echo "Cloud Storage adapter missing" >&2; exit 1; }
node "$ROOT/marketplace/deploy/prepare-postgres-schema.cjs" "$SOURCE"
mkdir -p "$DEST/prisma"
cp "$SOURCE/package.json" "$SOURCE/package-lock.json" "$SOURCE/tsconfig.json" "$DEST/"
cp -R "$SOURCE/src" "$DEST/src"
cp "$SOURCE/prisma/schema.production.prisma" "$DEST/prisma/schema.prisma"
cp "$ROOT/marketplace/deploy/Dockerfile" "$DEST/Dockerfile"
printf '%s\n' "node_modules" ".env" ".env.*" "*.db" "tests" ".git" > "$DEST/.dockerignore"
if grep -q 'provider = "sqlite"' "$DEST/prisma/schema.prisma"; then
  echo "Refusing SQLite Cloud Run image" >&2; exit 1
fi
echo "Cloud Run build context prepared. No credentials copied; no deployment performed."
