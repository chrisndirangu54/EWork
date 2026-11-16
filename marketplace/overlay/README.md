# TeknTandao Global Services — managed outsourcing + direct freelancer marketplace

## Scope implemented — managed BPO/KPO
- Branded public landing page at `/services` (five service categories, explain managed delivery, link to client login).
- Protected client workspace at `/managed` with company registration, verification status, service requests, quote acceptance, milestones, feedback/revisions and draft invoice records.
- Authorized admin API + dashboard for company verification, quotes, delivery-manager assignment, milestone submission, invoices and completion.
- Backend persistence through Prisma, data-owner scoping, status-transition rules, audit records and integer minor-unit money representation.
- Role-restricted specialist vetting API (admin-only; does not expose private freelancer details publicly).
- Crucial upstream authentication remediation: verifies Firebase JWT RS256 with Google's public certificates and strict issuer/audience/expiry claims, removes fallback and public role assignment.
- Requires a Firebase project owned by your team. Upstream author's Firebase configuration is not inherited.

## Checkout and apply the first-party overlay
```bash
git clone --recurse-submodules https://github.com/chrisndirangu54/EWork.git
cd EWork
bash marketplace/overlay/apply-overlay.sh
bash marketplace/overlay/verify-overlay.sh
```

The overlay script requires the pinned upstream Lancy commit. It modifies the **local submodule working tree**, so `git status` will show a dirty submodule as expected. The first-party overlay source remains versioned in EWork; do **not** commit those modifications inside the third-party submodule.

## Configuration (development only)
```bash
cd marketplace/upstream/lancy
cp ../../overlay/env.frontend.example .env.local
cd backend
cp ../../../overlay/env.backend.example .env
```

Edit the two generated files and set your own Firebase project values. Enable Email/Password or Google sign-in in that Firebase project's Auth settings. The frontend `VITE_FIREBASE_PROJECT_ID` and backend `FIREBASE_PROJECT_ID` must match. Never commit live credentials.

Then install and build (requires Node 22.x, npm and a network connection):
```bash
# From marketplace/upstream/lancy/backend
npm ci
npx prisma generate
npx prisma db push
npm run build
node -r ts-node/register --test tests/firebase-token.test.ts tests/managed-service.test.ts tests/freelance.test.ts
cd ..
npm ci
npm run build
npm run dev
```
In another terminal, from `marketplace/upstream/lancy/backend` run `npm run dev`.

**Prisma `db push` is for an empty/local development database only.** Before production, create and review a database migration, rehearse backup/rollback, and avoid forceful schema changes in production. The upstream backend currently uses SQLite by default.

## Client path
1. Client signs into Firebase and opens `/managed`.
2. Verified-email token is validated server-side; the client registers an organization (PENDING).
3. Admin reviews business information externally, then approves or rejects.
4. Client submits a service request (REQUESTED).
5. Admin quotes an approved organization (QUOTED).
6. Client accepts the amount (ACCEPTED); legal service agreement/signature must still be handled outside this MVP.
7. Admin assigns a delivery manager to begin work (ACTIVE), adds milestones and submits delivery notes.
8. Client approves or requests revisions; admin marks engagement completed once all milestones are approved.
9. Admin creates **draft invoice records only**. No checkout, escrow, payouts, invoice emailing, or provider settlement.

## API routes
Public: `GET /api/v1/managed/catalog`.

Authenticated: `GET/POST /managed/organizations`, `GET/POST /managed/engagements`, `GET /managed/engagements/:id`, `POST /managed/engagements/:id/accept`, `POST /managed/milestones/:id/review`.

Admin only: `PATCH /managed/admin/organizations/:id/verify`, `POST /managed/admin/engagements/:id/quote`, `POST /managed/admin/engagements/:id/start`, `POST /managed/admin/engagements/:id/milestones`, `POST /managed/admin/milestones/:id/submit`, `POST /managed/admin/engagements/:id/complete`, `POST /managed/admin/engagements/:id/invoice-drafts`, `GET/POST /managed/admin/specialists`.

All are prefixed with `/api/v1`. Authorized requests use `Authorization: Bearer <Firebase ID token>`. Do not use a Firebase client API key as a bearer token.

## Limitations before commercial release
- Upstream Lancy has additional endpoints and code that have **not** had a full independent security audit; new token verification does not certify the entire application.
- The existing upstream marketplace pages still carry Lancy branding; only the new Global Services pages are TeknTandao branded. A complete product rebrand remains future work.
- The quote-acceptance button is not a legally sufficient signed SOW; contracts, VAT/tax treatment and pricing terms must be implemented before paid use.
- Admin status verification is a manual attestation; independent KYB tools, document collection, and evidence review are not yet integrated.
- Service request forms do not include file attachments; the delivery manager must use approved channels pending secure storage.
- No tenancy team roles, per-country invoicing rules, payment gateway, real escrow, payouts, timesheets, or workforce scheduling.
- CI provides builds and selected unit tests but does not replace penetration testing or compliance due diligence.
- No production hosting or deployment is made by merging this PR.

## Environment safeguards
Use a project-specific Firebase project, properly configured HTTPS and CORS, managed secrets, an independent external security review, backups and incident response. Enable anti-abuse measures for sign-in and customer forms. If a client requires international data processing agreements, obtain them before transferring personal data.

## Second operating model: direct freelancer marketplace (development foundation)

The same authenticated TeknTandao frontend now supports **both**:
- **Managed services** at `/services` and `/managed`: company verification, organization-owned briefs, quotations, assigned delivery managers, milestones, approval/revision cycles and draft invoices. TeknTandao is responsible for delivery.
- **Direct hire** at `/freelance`, `/freelance/gigs/:id` and `/freelance/workspace`: freelancer application, admin verification, service listings with Basic/Standard/Premium packages, public discovery, order requests, buyer/seller messaging, delivery, revisions, reviews and administrator-mediated disputes. The freelancer is responsible for delivery.

Both models reuse the patched Firebase identity validator; they **do not** share payment ledgers or pretend to be a licensed escrow provider. The direct marketplace uses a proposed **12% commission estimate**, stored in minor currency units on each order snapshot. This is a proposed price policy, not a posted payout or a charge to any user.

### Direct marketplace workflow

1. A professional signs in, applies with a profile and awaits manual approval (`PENDING`).
2. An administrator independently checks identity and professional qualifications before marking `VERIFIED`.
3. The seller creates a draft gig with one to three currency-consistent packages and publishes it.
4. A client selects a package and submits a project brief. The platform records a `REQUESTED` order, **without payment**.
5. The verified seller accepts (`IN_PROGRESS`) or declines. The client may cancel an unaccepted request.
6. Seller submits a delivery note; buyer approves it or asks for revisions within the published limit.
7. Completed orders can be rated; disputes are reviewed by an administrator, who may resume or cancel the workflow. **No automatic refunds, funding or payouts occur.**

### Marketplace API endpoints

Public:
- `GET /api/v1/freelance/gigs?q=...`
- `GET /api/v1/freelance/gigs/:id`

Authenticated:
- `GET /api/v1/freelance/me`
- `POST /api/v1/freelance/seller/apply`
- `POST /api/v1/freelance/gigs`
- `POST /api/v1/freelance/gigs/:id/publish`
- `POST /api/v1/freelance/gigs/:id/archive`
- `POST /api/v1/freelance/orders`
- `GET /api/v1/freelance/orders`
- `GET /api/v1/freelance/orders/:id`
- `POST /api/v1/freelance/orders/:id/respond`
- `POST /api/v1/freelance/orders/:id/cancel`
- `POST /api/v1/freelance/orders/:id/deliver`
- `POST /api/v1/freelance/orders/:id/review-delivery`
- `GET/POST /api/v1/freelance/orders/:id/messages`
- `POST /api/v1/freelance/orders/:id/reviews`
- `POST /api/v1/freelance/orders/:id/disputes`

Admin:
- `GET /api/v1/freelance/admin/sellers`
- `PATCH /api/v1/freelance/admin/sellers/:id/verify`
- `GET /api/v1/freelance/admin/disputes`
- `POST /api/v1/freelance/admin/disputes/:id/resolve`

### Data and audit safeguards

- `FreelanceSeller`, `FreelanceGig`, `FreelancePackage`, `FreelanceOrder`, `FreelanceMessage`, `FreelanceReview` and `FreelanceDispute` are appended to upstream Prisma by `apply-overlay.sh`.
- Public discovery only lists **published** offers from **verified** sellers.
- Marketplace order reads, messages, delivery, reviews and disputes enforce server-side buyer/seller/admin ownership; cannot rely on the frontend to hide controls.
- Prices, proposed commission and revision limits are snapshotted on each order; changes to listings cannot rewrite existing orders.
- The service uses optimistic status checks and audits important transitions.
- The application must adopt verified local business records, appropriate contractor engagement terms, and GDPR/UK GDPR/Kenya DPA-compliant data handling before handling international customers.

### Not completed, do not claim production readiness

Payments, licensed escrow, chargebacks, payouts, taxes/VAT, processor reconciliation, legally executed contracts, seller evidence/KYC uploads, secure file delivery, advanced ranking/AI matching, live chat websocket integration, per-order payment status, workforce time tracking, revenue recognition, and complete third-party endpoint security audit are still pending. The existing upstream Lancy marketing pages are not fully rebranded. Merging the overlay **does not** launch or deploy the application.

### Applying safely

```bash
git submodule update --init --recursive
bash marketplace/overlay/apply-overlay.sh
bash marketplace/overlay/verify-overlay.sh
```

The script appends both Prisma schema fragments **idempotently** to the pinned Lancy checkout, then copies first-party source and tests. Do not run `prisma db push` on an existing production database. Prepare a reviewed migration and backup/rollback rehearsal first.
