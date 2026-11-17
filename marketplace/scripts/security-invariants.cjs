#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const app=source('overlay/lancy/backend/src/app.module.ts');
const auth=source('overlay/lancy/backend/src/common/guards/firebase-auth.guard.ts');
const payment=source('overlay/lancy/backend/src/commerce/commerce-payment.service.ts');
const documents=source('overlay/lancy/backend/src/documents/private-document.service.ts');
const main=source('overlay/lancy/backend/src/main.ts');

assert(auth.includes('verifyFirebaseIdToken'),'Firebase signed ID token verification missing');
assert(!auth.includes('defaultUser'),'Insecure default user fallback detected');
assert(payment.includes("process.env.PAYMENTS_MODE !== 'SANDBOX'"),'Checkout must be sandbox-only');
assert(payment.includes("startsWith('FLWSECK_TEST-')"),'Test-only provider key gate missing');
assert(payment.includes('verifyTransactionMatch(result, attempt)'), 'Independent verification missing');
assert(payment.includes('marketplacePaymentReceipt.create'),'Payment event idempotency missing');
assert(documents.includes("createCipheriv('aes-256-gcm'"),'Document encryption gate missing');
assert(documents.includes('await this.authorize(user, selected.scope, selected.resourceId)'),'Document access boundary missing');
assert(main.includes("limit: '4mb'"),'API body size limit missing');
assert(app.includes('CommercePaymentModule')&&app.includes('PrivateDocumentModule'),'Commerce routes not installed');
assert(!app.includes('PaymentsModule'),'Legacy mock payment endpoints must not be active');

// Reject production checkout or open document-vault execution without manual security review.
if(process.env.NODE_ENV==='production'){
  assert(process.env.PAYMENTS_MODE !== 'LIVE','Live payments must remain disabled');
  assert(process.env.FIREBASE_PROJECT_ID,'Firebase project must be configured');
  assert(process.env.CORS_ORIGINS,'Strict CORS origins must be configured');
  for(const origin of process.env.CORS_ORIGINS.split(',')){
    assert(origin.startsWith('https://'),'Production CORS origins must be HTTPS');
  }
  assert(process.env.DOCUMENT_VAULT_APPROVED!=='true' ||
    (Buffer.from(process.env.DOCUMENT_VAULT_KEY_B64||'','base64').length===32 &&
    path.isAbsolute(process.env.DOCUMENT_VAULT_DIR||'')),
    'Approved vault requires private absolute path and 256-bit key');
}
console.log('Static fail-closed marketplace security invariants passed. Not a security certification.');
