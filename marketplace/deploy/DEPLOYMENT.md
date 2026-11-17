# Low-fixed-cost deployment: Firebase Hosting + Cloud Run

**Status:** Deployment scripts and production image preparation. These commands do NOT automatically deploy during a GitHub merge. Review source and credentials before any public rollout.

## Architecture

| Workload | Target | Notes |
| --- | --- | --- |
| React/Vite browser application | Firebase Hosting | SPA fallback, same-origin `/api/**` Cloud Run rewrite |
| NestJS + Prisma REST API | Cloud Run | 1 vCPU, 512 MiB, 20 concurrent requests, **minimum 0**, **maximum 2** instances |
| Durable relational data | PostgreSQL (managed provider) | Database is EXTERNAL to Cloud Run; provider chosen by the account owner |
| Login | Firebase Authentication | Own project and approved sign-in methods |
| Private project files | Cloud Storage bucket | Encrypted content, bucket-level IAM, no public URLs |
| Secrets | Google Secret Manager | DATABASE_URL and DOCUMENT_VAULT_KEY_B64; no plaintext key file |
| Billing controls | Cloud Billing budgets and Cloud Run max instances | Budget alerts are **notifications, not a cost cap** |

The default location is `europe-west1` because Firebase Hosting supports Cloud Run rewrites there and it is practical for UK/EU customers. Select your specific region before deploying to satisfy latency and data residency commitments.

## Prerequisites (manual steps)

1. Choose an existing Google Cloud project with Firebase enabled and Blaze billing active; enable Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Cloud Storage APIs. The Firebase CLI and Google Cloud CLI must already be authenticated and authorized; **no account or billing resources were activated by this PR**.
2. Create a dedicated service account for Cloud Run. Grant **only** Secret Manager Secret Accessor to the two named secrets and **bucket-scoped** `roles/storage.objectUser` on an existing non-public Cloud Storage bucket. Enable uniform bucket-level access and public access prevention. Review backups, retention, lifecycle and region.
3. Create a managed PostgreSQL database with verified backup/restore, TLS, sensible connection limits, and a connection string. A low-cost external provider may keep idle costs below Cloud SQL, but validate production terms and vendor data-location guarantees. Require `sslmode=require` and, where supported, certificate verification. Put the connection string in Secret Manager under the name chosen for `POSTGRES_SECRET_NAME`.
4. Generate and securely store a stable 32-byte base64 encryption key (`openssl rand -base64 32`) in Secret Manager using the name for `VAULT_KEY_SECRET_NAME`. Plan key recovery and rotation; losing the key destroys access to encrypted files. Never paste the key into source or CI logs.
5. Create your own Firebase Web application and set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_PROJECT_ID`, plus optional `VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_MESSAGING_SENDER_ID` for frontend builds. This must match the backend `FIREBASE_PROJECT_ID`.
6. In Google Cloud Console → Billing → Budgets & alerts, create a low initial spend warning (for example USD $10/month) with 50%, 90%, and 100% notifications. **This does not stop service or spending.** Use quota and API monitoring as additional safeguards.
7. Run a third-party endpoint security review, verify data-processing agreements, and confirm all production legal/privacy obligations before exposing client information. Do not use this application's sandbox commerce features as real checkout.

## Apply overlay and validate PostgreSQL schema

```bash
git clone --recurse-submodules https://github.com/chrisndirangu54/EWork.git
cd EWork
bash marketplace/overlay/apply-overlay.sh
node marketplace/deploy/prepare-postgres-schema.cjs
node marketplace/deploy/test-production-build.cjs
cd marketplace/upstream/lancy/backend
npm ci
# A placeholder URL suffices for schema *validation* and SQL generation, not for a live connection.
export DATABASE_URL='postgresql://test:test@localhost:5432/tgs?schema=public'
npx prisma validate --schema prisma/schema.production.prisma
npx prisma migrate diff --from-empty --to-schema prisma/schema.production.prisma --script > /tmp/tgs-bootstrap.sql
```

**Read and review** `/tmp/tgs-bootstrap.sql`. This script is for a **brand-new empty PostgreSQL database only**. Do not apply it to an existing production database. For a first deployment, create a reviewed Prisma baseline migration at `prisma/migrations/000000000000_init/migration.sql` from that file; then, with a **real** secure `DATABASE_URL` set, run `npx prisma migrate deploy --schema prisma/schema.production.prisma`. Test on a staging database first. Existing SQLite data are NOT migrated automatically, and later schema changes require reviewed migrations.

## Cloud Run deployment (explicit operator action)

Export the following environment variables in an authorized deployment shell. These names represent your own resources, not resources provisioned by this repository.

```bash
export GCP_PROJECT_ID='your-firebase-gcp-project-id'
export FIREBASE_PROJECT_ID="$GCP_PROJECT_ID"
export CLOUD_RUN_SERVICE_ACCOUNT='tgs-api@your-project.iam.gserviceaccount.com'
export DOCUMENT_VAULT_GCS_BUCKET='your-private-files-bucket'
export POSTGRES_SECRET_NAME='tgs-database-url'
export VAULT_KEY_SECRET_NAME='tgs-document-vault-key'
export GCP_REGION='europe-west1'
export CLOUD_RUN_SERVICE='tekntandao-api'
# Only AFTER cost/security review and first schema migration:
export DEPLOY_CONFIRM='I_APPROVE_CLOUD_CHARGES_AND_PUBLIC_API'
bash marketplace/deploy/deploy-cloudrun.sh
```

The script creates an isolated PostgreSQL-compatible Docker build context (without copying `.env` files), deploys a non-root Node.js container, configures min instances 0/max instances 2, and passes secrets through Secret Manager references. It exposes the API so Firebase Hosting rewrites can reach it; **assume every unauthenticated upstream route is internet-accessible until audited**. The script keeps `PAYMENTS_MODE=DISABLED` and `DOCUMENT_VAULT_APPROVED=false`, meaning live payment and private document workflows remain closed by default. To launch document access, obtain approval, perform malware scanning, penetration tests, and key storage review first.

## Firebase Hosting deployment (explicit operator action)

Install `firebase-tools` and authenticate with an account authorized for Firebase Hosting. Then export:

```bash
export VITE_FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID"
export VITE_FIREBASE_API_KEY='your-firebase-web-public-key'
export VITE_FIREBASE_AUTH_DOMAIN='your-project.firebaseapp.com'
export VITE_FIREBASE_APP_ID='your-firebase-web-app-id'
bash marketplace/deploy/deploy-firebase-hosting.sh
```

The script builds the existing React/Vite app with `VITE_API_BASE_URL=/api/v1`, creates a temporary Firebase config, forwards `/api/**` to the configured Cloud Run service, and forwards all other routes to `index.html`. It does not check in any secrets. For custom domains, configure Firebase Hosting and add their permitted CORS origins separately.

## Rollout gates

- Confirm PostgreSQL schema and backup/restore. Test DB access from Cloud Run and use connection pooling to avoid exhausting a small managed database.
- Ensure the Cloud Run service identity can access **only** its approved secrets and private document bucket.
- Review **all** upstream application endpoints for tenant isolation, auth, anti-abuse, throttling and data leakage; existing guards have not undergone a complete audit.
- Confirm Cloud Storage files never use public read ACLs or unsigned public URLs. Upload and download operations use the service identity; private contents remain encrypted using the existing AES-256-GCM format.
- Update website terms, policies, professional-services contracts, KYC/KYB and GDPR/UK GDPR/Kenya data-protection documentation.
- Validate client signup, service request, seller listing, order, quote, file upload/download, sandbox-only payment status, and webhook signature rejection.
- Review audit logs, request volume, cloud-cost dashboards, failures, and recovery procedures.

**Important:** max instances is a scaling control, not a hard dollar spend limit; instance counts can occasionally exceed the target during transitions. Cloud Storage requests, egress, managed PostgreSQL, networking and build artifacts may all incur charges independently.
