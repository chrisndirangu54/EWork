# Global Jobs API — EWork ↔ TeknTandao Workspace

## Objective
Give international clients a job-posting and freelancer-hiring workflow in the Global Marketplace, while professionals in TeknTandao Workspace can discover, apply for, accept and deliver **the same jobs without leaving the EWork module**.

The canonical database is the EWork NestJS/Prisma marketplace API. The Flutter Workspace makes authenticated HTTPS REST calls; it does **not** mirror employer messages or assignment data into globally readable Firestore collections.

## Authentication & deployment requirements
- Both apps must use **the same Firebase Authentication project**. EWork's `FIREBASE_PROJECT_ID` must match TeknTandao Workspace's authenticated Firebase project.
- Backend FirebaseAuthGuard cryptographically validates ID-token signature, issuer, audience, expiry, verified email and known user status. It resolves a stable EWork User by firebaseUid.
- Flutter sends a fresh Firebase ID token as an `Authorization: Bearer` header over HTTPS to the configured EWork `/api/v1` endpoint. No shared API secret lives in the frontend.
- Include the Workspace Hosting origin in the NestJS server's explicit `CORS_ORIGINS`; **never use wildcard CORS with authenticated endpoints**.
- Configure `--dart-define=EWORK_GLOBAL_API_BASE_URL=https://<ework-api-host>/api/v1` in the Workspace Flutter build. Default is disabled with an explanatory UI. In EWork, existing `VITE_API_BASE_URL` remains unchanged.
- Firebase projects with different audiences cannot exchange ID tokens; a controlled identity federation or explicit account-linking migration would be needed before cross-project deployment.

## API v1

Public browsing is limited to jobs in `OPEN` state, returning only a safe job summary (not applicant details or employer contact information):

```
GET /api/v1/global-jobs?q=Python
GET /api/v1/global-jobs/:id
```

All other endpoints require a verified Firebase ID token.

| HTTP route | Authorized actor | Effect |
|---|---|---|
| `GET /global-jobs/workspace` | Signed-in user | Own applications, assignments and employer postings |
| `POST /global-jobs` | Signed-in user | Publish job, budget, skills, and milestone plan |
| `POST /global-jobs/:id/applications` | Other signed-in user | Submit one proposal per job, never own job |
| `GET /global-jobs/:id/applications` | Employer only | Read proposals to own job |
| `POST /global-jobs/:id/offer` | Employer only | Offer to an **admin-verified** freelancer, race guarded |
| `POST /global-jobs/:id/offer/respond` | Selected freelancer only | Accept or decline assignment |
| `POST /global-jobs/:id/close` | Employer only | Close an unassigned open job |
| `GET /global-jobs/:id/workspace` | Employer / selected freelancer | Private job state and milestone details |
| `GET/POST /global-jobs/:id/updates` | Employer/worker read, assigned worker write | Work progress history |
| `GET/POST /global-jobs/:id/messages` | Employer/worker read; write on active jobs | Project-only messaging |
| `POST /global-jobs/:id/milestones/:mid/submit` | Assigned worker only | Submit deliverable summary |
| `POST /global-jobs/:id/milestones/:mid/review` | Employer only | Accept or request changes |
| `GET/POST /private-documents` | Employer / accepted freelancer | Private files scoped to `GLOBAL_JOB` |
| `GET /private-documents/:id/download` | Employer / accepted freelancer | Encrypted attachment download |

All paths in the table are prefixed by `/api/v1`. Backend status is authoritative; Flutter never directly mutates Prisma or bypasses access checks.

## Workflow

```
OPEN -> OFFERED -> IN_PROGRESS -> COMPLETED
  |        |
  |        +-- declined -> OPEN
  +-- CLOSED

Job application: APPLIED -> OFFERED -> SELECTED (or DECLINED/NOT_SELECTED)
Milestone: OPEN -> SUBMITTED -> ACCEPTED
                   |
                   +-- CHANGES_REQUESTED -> SUBMITTED
```

Jobs in `OPEN` state can receive proposals. Offers require an existing verified seller account, and cannot be sent twice concurrently. On freelancer acceptance, other pending applications become `NOT_SELECTED`. Milestone acceptance requires the job employer; when all milestones are accepted, the job transitions to `COMPLETED`. Neither job acceptance nor milestone approval moves money or executes a legal contract.

## Integrating with existing Workspace talent postings

The existing Workspace `talentJobPostings` Firestore board remains operational. Its employer role card now offers **Share to Global Jobs**, visible only to the verified Firebase user who originally posted it. The action explicitly publishes a corresponding listing via the EWork API using a stable `sourceRef = talent_<Firestore-ID>` and returns an existing listing on repeated submissions.

This is **opt-in one-way publication**, not a background mirror or a dual-written canonical job system. Changes or closure of the original Firestore role are **not** automatically synchronized in this version; the employer must manage the global job separately. This avoids broadcasting existing employer postings without consent, or silently changing active marketplace assignments.

## Deployment and safety checklist

1. Install a reviewed Prisma migration for `GlobalJob`, `GlobalJobApplication`, `GlobalJobMilestone`, `GlobalJobMessage`, and `GlobalJobUpdate` before deploying the backend. Never run Prisma `db push` on live customer data.
2. Build and deploy EWork NestJS/Prisma API; deploy Flutter Workspace with correct HTTPS endpoint and matching Firebase project.
3. Verify employer login, freelancer login, seller verification, offer, rejection, milestone, messages and encrypted attachments using distinct test accounts.
4. Configure explicit CORS origins; enforce API-level rate limits, moderation, antifraud, KYC/KYB, content safety, retention and data-processing obligations before general public listing.
5. Do not enable Stripe/Flutterwave live checkout, automatic payouts, legally represented escrow, or cross-border client document use without the corresponding approvals and contracts.
6. Audit other upstream Lancy endpoints separately; this focused implementation is **not** a production security certification.

## Release status

Code only. No external resources are provisioned, no schema migrations run against a production database, and no public deployment executed by merging this change. Global jobs become visible in Workspace only after both applications are deployed and configured to use the same Firebase identity issuer and the EWork API.
