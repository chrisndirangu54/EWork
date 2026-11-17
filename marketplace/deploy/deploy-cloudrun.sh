#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
for key in GCP_PROJECT_ID FIREBASE_PROJECT_ID CLOUD_RUN_SERVICE_ACCOUNT DOCUMENT_VAULT_GCS_BUCKET POSTGRES_SECRET_NAME VAULT_KEY_SECRET_NAME; do
  if [[ -z "$(printenv "$key" || true)" ]]; then echo "Required environment: $key" >&2; exit 2; fi
done
if [[ "$(printenv DEPLOY_CONFIRM || true)" != "I_APPROVE_CLOUD_CHARGES_AND_PUBLIC_API" ]]; then
  echo "No deployment. First review data security, budget and public routes; then set DEPLOY_CONFIRM=I_APPROVE_CLOUD_CHARGES_AND_PUBLIC_API" >&2
  exit 2
fi
if [[ "$FIREBASE_PROJECT_ID" != "$GCP_PROJECT_ID" ]]; then
  echo "Use the same Firebase/Cloud project" >&2; exit 2
fi
REGION="$(printenv GCP_REGION || true)"
SERVICE="$(printenv CLOUD_RUN_SERVICE || true)"
if [[ -z "$REGION" ]]; then REGION=europe-west1; fi
if [[ -z "$SERVICE" ]]; then SERVICE=tekntandao-api; fi
case "$REGION" in europe-west1|us-central1|us-east1|us-west1|asia-east1) ;; *)
  echo "Unsupported region for vetted Hosting rewrite" >&2; exit 2;; esac
if [[ ! "$SERVICE" =~ ^[a-z][a-z0-9-]{0,40}$ ]]; then echo "Invalid Cloud Run service name" >&2; exit 2; fi
command -v gcloud >/dev/null || { echo "Google Cloud CLI required" >&2; exit 2; }
if ! gcloud storage buckets describe "gs://$DOCUMENT_VAULT_GCS_BUCKET" --project "$GCP_PROJECT_ID" >/dev/null; then
  echo "Private Cloud Storage bucket missing" >&2; exit 2
fi
gcloud secrets describe "$POSTGRES_SECRET_NAME" --project "$GCP_PROJECT_ID" >/dev/null || exit 2
gcloud secrets describe "$VAULT_KEY_SECRET_NAME" --project "$GCP_PROJECT_ID" >/dev/null || exit 2
bash "$ROOT/marketplace/overlay/apply-overlay.sh"
bash "$ROOT/marketplace/overlay/verify-overlay.sh"
CONTEXT="$(mktemp -d)"
trap 'rm -rf "$CONTEXT"' EXIT
bash "$ROOT/marketplace/deploy/prepare-cloudrun-context.sh" "$CONTEXT"
echo "Cloud Run public API requires audited security and client consent before commercial use."
echo "Cloud Run scale-to-zero, max 2 instances, 1 CPU, 512MiB, concurrency 20."
gcloud run deploy "$SERVICE" \
  --source "$CONTEXT" \
  --project "$GCP_PROJECT_ID" \
  --region "$REGION" \
  --service-account "$CLOUD_RUN_SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --concurrency 20 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 60s \
  --cpu-throttling \
  --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID,DOCUMENT_VAULT_BACKEND=gcs,DOCUMENT_VAULT_GCS_BUCKET=$DOCUMENT_VAULT_GCS_BUCKET,DOCUMENT_VAULT_APPROVED=false,PAYMENTS_MODE=DISABLED,AI_PROVIDER=MOCK,CORS_ORIGINS=https://$FIREBASE_PROJECT_ID.web.app" \
  --set-secrets "DATABASE_URL=$POSTGRES_SECRET_NAME:latest,DOCUMENT_VAULT_KEY_B64=$VAULT_KEY_SECRET_NAME:latest"
echo "Backend deployment requested; verify logs, database and permissions."
echo "Private document access remains disabled until malware scanning and security approval."
