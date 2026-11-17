#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const { execFileSync }=require('node:child_process');
const root=path.resolve(__dirname,'..','..');
const schema=path.join(root,'marketplace/upstream/lancy/backend/prisma/schema.prisma');
const before=fs.readFileSync(schema,'utf8');
execFileSync('node',[path.join(root,'marketplace/deploy/prepare-postgres-schema.cjs')],{stdio:'pipe'});
const production=fs.readFileSync(path.join(path.dirname(schema),'schema.production.prisma'),'utf8');
assert(production.includes('provider = "postgresql"'));
assert(production.includes('url = env("DATABASE_URL")'));
assert(!production.includes('provider = "sqlite"'));
assert(production.includes('model FreelanceOrder'));
assert(production.includes('model MarketplaceAttachment'));
assert.equal(before,fs.readFileSync(schema,'utf8'),'Development schema must remain unchanged');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tgs-deploy-test-'));
const context=path.join(tmp,'context');
try {
  execFileSync('bash',[path.join(root,'marketplace/deploy/prepare-cloudrun-context.sh'),context],{stdio:'pipe'});
  const docker=fs.readFileSync(path.join(context,'Dockerfile'),'utf8');
  const staged=fs.readFileSync(path.join(context,'prisma/schema.prisma'),'utf8');
  assert(docker.includes('USER node'),'Container must not run as root');
  assert(docker.includes('node dist/main.js'));
  assert(staged.includes('provider = "postgresql"'));
  assert(!fs.existsSync(path.join(context,'.env')));
  assert(!fs.existsSync(path.join(context,'node_modules')));
  assert(!fs.existsSync(path.join(context,'prisma/dev.db')));
  console.log('Cloud Run context and PostgreSQL schema assertions passed');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
