#!/usr/bin/env bash
# Apply first-party TeknTandao customization to pinned, checkout-only Lancy submodule.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="$ROOT/marketplace/overlay/lancy"
TARGET="$ROOT/marketplace/upstream/lancy"
PIN="fe7ed71856c4a8fd31df28a35726c4caf395c5eb"
if [[ ! -d "$TARGET/.git" && ! -f "$TARGET/.git" ]]; then
  echo "Lancy submodule missing; run git submodule update --init --recursive" >&2
  exit 1
fi
CURRENT="$(git -C "$TARGET" rev-parse HEAD)"
if [[ "$CURRENT" != "$PIN" ]]; then
  echo "Lancy revision $CURRENT is not approved pinned revision $PIN" >&2
  exit 1
fi
if [[ ! -f "$TARGET/backend/prisma/schema.prisma" ]]; then
  echo "Unexpected upstream structure; refusing changes" >&2
  exit 1
fi
# Copy overlay files (including mandatory authentication hardening) into upstream checkout.
while IFS= read -r -d '' file; do
  destination="$TARGET/${file#"$SOURCE/"}"
  mkdir -p "$(dirname "$destination")"
  cp "$file" "$destination"
done < <(find "$SOURCE" -type f -print0)
if ! grep -q '^model ManagedOrganization {' "$TARGET/backend/prisma/schema.prisma"; then
  cat "$ROOT/marketplace/overlay/prisma-managed.prisma" >> "$TARGET/backend/prisma/schema.prisma"
fi
if ! grep -q '^model FreelanceSeller {' "$TARGET/backend/prisma/schema.prisma"; then
  cat "$ROOT/marketplace/overlay/prisma-freelance.prisma" >> "$TARGET/backend/prisma/schema.prisma"
fi
if ! grep -q '^model MarketplaceCheckoutAttempt {' "$TARGET/backend/prisma/schema.prisma"; then
  cat "$ROOT/marketplace/overlay/prisma-commerce.prisma" >> "$TARGET/backend/prisma/schema.prisma"
fi
echo "Applied TeknTandao managed, freelance and secure commerce overlays to Lancy checkout at $CURRENT"
echo "Source lives in EWork/marketplace/overlay, while submodule remains pinned to the audited baseline."
echo "Next: configure unique Firebase environment variables, install dependencies, generate Prisma client, and build."
