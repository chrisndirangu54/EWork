#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
for key in FIREBASE_PROJECT_ID GCP_PROJECT_ID VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_APP_ID VITE_FIREBASE_PROJECT_ID; do
  if [[ -z "$(printenv "$key" || true)" ]]; then echo "Required environment: $key" >&2; exit 2; fi
done
if [[ "$VITE_FIREBASE_PROJECT_ID" != "$FIREBASE_PROJECT_ID" || "$GCP_PROJECT_ID" != "$FIREBASE_PROJECT_ID" ]]; then
  echo "Frontend, Firebase Auth and Cloud Run must use the same project" >&2; exit 2
fi
if [[ "$(printenv DEPLOY_CONFIRM || true)" != "I_APPROVE_CLOUD_CHARGES_AND_PUBLIC_API" ]]; then
  echo "No deployment; explicit DEPLOY_CONFIRM required" >&2; exit 2
fi
REGION="$(printenv GCP_REGION || true)"
SERVICE="$(printenv CLOUD_RUN_SERVICE || true)"
if [[ -z "$REGION" ]]; then REGION=europe-west1; fi
if [[ -z "$SERVICE" ]]; then SERVICE=tekntandao-api; fi
case "$REGION" in europe-west1|us-central1|us-east1|us-west1|asia-east1) ;; *)
  echo "Unsupported Hosting rewrite region" >&2; exit 2;; esac
command -v firebase >/dev/null || { echo "Firebase CLI required" >&2; exit 2; }
bash "$ROOT/marketplace/overlay/apply-overlay.sh"
FRONT="$ROOT/marketplace/upstream/lancy"
(
  cd "$FRONT"
  npm ci
  export VITE_API_BASE_URL=/api/v1
  npm run build
)
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/public"
cp -R "$FRONT/dist/." "$STAGE/public/"
export TGS_STAGE="$STAGE" TGS_REGION="$REGION" TGS_SERVICE="$SERVICE"
node - <<'NODE'
const fs=require('fs');
const path=require('path');
const cfg={hosting:{
  public:'public',
  ignore:['firebase.json','**/.*','**/node_modules/**'],
  rewrites:[
    {source:'/api/**',run:{serviceId:process.env.TGS_SERVICE,region:process.env.TGS_REGION}},
    {source:'**',destination:'/index.html'}
  ],
  headers:[{source:'**',headers:[{key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'}]}]
}};
fs.writeFileSync(path.join(process.env.TGS_STAGE,'firebase.json'),JSON.stringify(cfg,null,2));
NODE
(
  cd "$STAGE"
  firebase deploy --only hosting --project "$FIREBASE_PROJECT_ID"
)
echo "Firebase Hosting deployment requested. Confirm routes and authentication."
