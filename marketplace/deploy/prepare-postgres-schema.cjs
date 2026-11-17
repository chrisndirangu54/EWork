#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const backend = process.argv[2] ? path.resolve(process.argv[2]) :
  path.join(root, 'marketplace/upstream/lancy/backend');
const source = path.join(backend,'prisma/schema.prisma');
const target = path.join(backend,'prisma/schema.production.prisma');
const raw = fs.readFileSync(source,'utf8');
const matcher = /datasource\s+db\s*\{[^}]*\}/m;
const original = raw.match(matcher)?.[0];
if (!original || !/provider\s*=\s*"sqlite"/.test(original)) {
  throw new Error('Expected original SQLite datasource. Apply overlay before converting.');
}
if (!raw.includes('model ManagedOrganization') || !raw.includes('model FreelanceOrder') ||
    !raw.includes('model MarketplaceCheckoutAttempt')) {
  throw new Error('Incomplete marketplace schema; refusing conversion');
}
const migrated = raw.replace(matcher,
  'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}');
if (migrated === raw || migrated.includes('file:./dev.db')) {
  throw new Error('PostgreSQL schema conversion failed');
}
fs.writeFileSync(target,migrated,{mode:0o600});
console.log('Generated PostgreSQL schema:', target);
console.log('Database was NOT modified');
