#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="$ROOT/marketplace/upstream/lancy"
[[ -f "$TARGET/backend/src/managed/managed.controller.ts" ]] || { echo 'Overlay missing' >&2; exit 1; }
[[ -f "$TARGET/backend/src/common/security/firebase-id-token.ts" ]] || { echo 'Auth verification missing' >&2; exit 1; }
grep -q "FIREBASE_PROJECT_ID" "$TARGET/backend/src/common/guards/firebase-auth.guard.ts"
! grep -q "defaultUser" "$TARGET/backend/src/common/guards/firebase-auth.guard.ts"
! grep -q "dto.role || 'FREELANCER'" "$TARGET/backend/src/auth/auth.controller.ts"
grep -q "model ManagedInvoice" "$TARGET/backend/prisma/schema.prisma"
grep -q 'path="/managed"' "$TARGET/src/App.tsx"
grep -q 'path="/freelance"' "$TARGET/src/App.tsx"
grep -q 'path="/freelance/workspace"' "$TARGET/src/App.tsx"
grep -q 'model FreelanceOrder' "$TARGET/backend/prisma/schema.prisma"
grep -q 'model FreelanceGig' "$TARGET/backend/prisma/schema.prisma"
[[ -f "$TARGET/backend/src/freelance/freelance.controller.ts" ]]
grep -q 'model MarketplaceCheckoutAttempt' "$TARGET/backend/prisma/schema.prisma"
grep -q 'model MarketplaceAttachment' "$TARGET/backend/prisma/schema.prisma"
[[ -f "$TARGET/backend/src/commerce/commerce-payment.controller.ts" ]]
[[ -f "$TARGET/backend/src/documents/private-document.controller.ts" ]]
grep -q 'path="/payment/return"' "$TARGET/src/App.tsx"
echo 'Static integration assertions passed (not a substitute for runtime tests or audit).'
