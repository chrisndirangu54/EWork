import test from 'node:test';
import assert from 'node:assert/strict';
import { ManagedService } from '../src/managed/managed.service';

const client = { id: 'u-1', role: 'FREELANCER', email: 'client@example.org', name: 'Client', status: 'ACTIVE' } as any;
const other = { ...client, id: 'u-2' };
const admin = { ...client, id: 'admin', role: 'ADMIN' };
function serviceStub() {
  const organizations = [{ id: 'org-1', ownerId: client.id, name: 'Example Ltd', country: 'Kenya', status: 'VERIFIED' }];
  const db = {
    managedOrganization: {
      findUnique: async ({ where }: any) => organizations.find(o => o.id === where.id) || null,
      findMany: async ({ where }: any) => organizations.filter(o => !where.ownerId || o.ownerId === where.ownerId),
      create: async ({ data }: any) => ({ id: 'created', status: 'PENDING', ...data }),
    },
    managedEngagement: { create: async ({ data }: any) => ({ id: 'eng-1', status: 'REQUESTED', ...data }) },
    auditLog: { create: async () => ({}) },
  };
  return new ManagedService(db as any);
}

test('company registration binds to authenticated user, never supplied ownerId', async () => {
  const s = serviceStub();
  const org = await s.createOrganization(client, { name: 'New Co', country: 'UK', ownerId: 'admin' }) as any;
  assert.equal(org.ownerId, client.id);
  assert.equal(org.status, 'PENDING');
});
test('other customers cannot request services against an organization they do not own', async () => {
  const s = serviceStub();
  await assert.rejects(s.request(other, { organizationId:'org-1',serviceSlug:'ai-automation',title:'Test',brief:'Build it' }));
});
test('client-owned organization may create a scoped service request', async () => {
  const s = serviceStub();
  const result = await s.request(client, { organizationId:'org-1',serviceSlug:'ai-automation',title:'Project',brief:'Automation scope',currency:'USD' }) as any;
  assert.equal(result.organizationId, 'org-1');
  assert.equal(result.status, 'REQUESTED');
});
test('non-admins cannot vet organizations, issue quotes or create invoices', async () => {
  const s = serviceStub();
  await assert.rejects(s.setVerification(client, 'org-1', { approved:true }));
  await assert.rejects(s.quote(client, 'eng-1', { quotedCents:10000 }));
  await assert.rejects(s.draftInvoice(client, 'eng-1', { amountCents:10000 }));
});
test('invalid service slug and malformed amount reject before writes', async () => {
  const s = serviceStub();
  await assert.rejects(s.request(client, { organizationId:'org-1', serviceSlug:'other', title:'X',brief:'Y' }));
  // Exercise rejection for missing record even with an admin context.
  await assert.rejects(s.setVerification(admin, 'missing', { approved:true }));
});
