import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrivateVaultStore } from '../src/documents/private-vault.store';

test('Cloud Storage vault uses Cloud Run identity and private object endpoints', async () => {
  const old = {
    DOCUMENT_VAULT_BACKEND:process.env.DOCUMENT_VAULT_BACKEND,
    DOCUMENT_VAULT_GCS_BUCKET:process.env.DOCUMENT_VAULT_GCS_BUCKET,
    DOCUMENT_VAULT_APPROVED:process.env.DOCUMENT_VAULT_APPROVED,
    NODE_ENV:process.env.NODE_ENV,
  };
  const previousFetch=globalThis.fetch;
  process.env.DOCUMENT_VAULT_BACKEND='gcs';
  process.env.DOCUMENT_VAULT_GCS_BUCKET='tekntandao-private-test-logs';
  process.env.DOCUMENT_VAULT_APPROVED='true';
  process.env.NODE_ENV='test';
  let vault:Buffer|undefined;
  const urls:string[]=[];
  globalThis.fetch=(async (input:RequestInfo | URL, init?:RequestInit) => {
    const target=String(input);
    urls.push(target);
    if (target.startsWith('http://metadata.google.internal/')) {
      assert.equal((init?.headers as Record<string,string>)['Metadata-Flavor'],'Google');
      return new Response(JSON.stringify({access_token:'fake-token',expires_in:3600}),{
        status:200,headers:{'Content-Type':'application/json'} });
    }
    assert(target.startsWith('https://storage.googleapis.com/'),'Non-GCS host requested');
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer fake-token');
    if(init?.method==='POST'){
      vault=Buffer.from(init.body as Uint8Array);
      assert(target.includes('ifGenerationMatch=0'),'Upload must be create-only');
      return new Response('{}',{status:200});
    }
    if(init?.method==='GET') return new Response(new Uint8Array(vault!),{status:200});
    if(init?.method==='DELETE') { vault=undefined;return new Response(null,{status:204}); }
    return new Response(null,{status:500});
  }) as typeof fetch;
  try{
    const store=new PrivateVaultStore();
    const key=randomUUID()+'.vault';
    const blob=Buffer.alloc(64,7);
    await store.write(key,blob);
    assert.deepEqual(await store.read(key),blob);
    await store.remove(key);
    assert.equal(vault,undefined);
    assert(urls.some(x=>x.includes('alt=media')));
    await assert.rejects(store.read('../bad'));
  }finally{
    globalThis.fetch=previousFetch;
    for(const [name,value] of Object.entries(old)){
      if(value===undefined) delete process.env[name];else process.env[name]=value;
    }
  }
});
test('Production vault rejects ephemeral local storage', async() => {
  const previous=process.env.NODE_ENV;
  const priorBackend=process.env.DOCUMENT_VAULT_BACKEND;
  try{
    process.env.NODE_ENV='production';
    process.env.DOCUMENT_VAULT_BACKEND='local';
    await assert.rejects(new PrivateVaultStore().read(randomUUID()+'.vault'));
  }finally{
    if(previous===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previous;
    if(priorBackend===undefined) delete process.env.DOCUMENT_VAULT_BACKEND; else process.env.DOCUMENT_VAULT_BACKEND=priorBackend;
  }
});
