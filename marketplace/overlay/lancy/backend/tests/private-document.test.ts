import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrivateDocumentService } from '../src/documents/private-document.service';

const client={id:'buyer',role:'CLIENT',name:'Buyer',status:'ACTIVE'} as any;
const stranger={...client,id:'unrelated'};
const seller={id:'seller-1',role:'FREELANCER',status:'ACTIVE'} as any;

test('documents are encrypted and accessible only to relevant participants',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'tgs-document-test-'));
  const original={dir:process.env.DOCUMENT_VAULT_DIR,key:process.env.DOCUMENT_VAULT_KEY_B64,
    nodeEnv:process.env.NODE_ENV};
  process.env.DOCUMENT_VAULT_DIR=folder;
  process.env.DOCUMENT_VAULT_KEY_B64=randomBytes(32).toString('base64');
  process.env.NODE_ENV='test';
  const saved=new Map<string,any>();
  const db={
    freelanceOrder:{findUnique:async({where}:any)=>where.id==='order-1'?{
      id:where.id,buyerId:'buyer',seller:{userId:'seller-1'}
    }:null},
    managedEngagement:{findUnique:async()=>null},
    marketplaceAttachment:{
      create:async({data}:any)=>{const file={id:'file-1',createdAt:new Date(),...data};saved.set(file.id,file);return file;},
      findUnique:async({where}:any)=>saved.get(where.id)||null,
      findMany:async()=>Array.from(saved.values()),
    },
    auditLog:{create:async()=>({})}
  };
  const service=new PrivateDocumentService(db as any);
  try{
    const plain=Buffer.from('%PDF-1.4\nPrivate demo document\n%%EOF');
    await assert.rejects(service.upload(stranger,{
      scope:'FREELANCE_ORDER',resourceId:'order-1',filename:'private.pdf',
      contentType:'application/pdf',contentBase64:plain.toString('base64')
    }));
    await assert.rejects(service.upload(client,{
      scope:'FREELANCE_ORDER',resourceId:'order-1',filename:'private.pdf',
      contentType:'image/png',contentBase64:plain.toString('base64')
    }));
    const file=await service.upload(client,{
      scope:'FREELANCE_ORDER',resourceId:'order-1',filename:'private.pdf',
      contentType:'application/pdf',contentBase64:plain.toString('base64')
    }) as any;
    assert.equal(file.id,'file-1');
    await assert.rejects(service.download(stranger,'file-1'));
    const result=await service.download(seller,'file-1');
    assert.deepEqual(result.content,plain);
    assert.equal(result.filename,'private.pdf');
    const files=await service.list(client,'FREELANCE_ORDER','order-1');
    assert.equal(files.length,1);
  } finally{
    await rm(folder,{recursive:true,force:true});
    for(const [name,key] of Object.entries({DOCUMENT_VAULT_DIR:original.dir,
      DOCUMENT_VAULT_KEY_B64:original.key,NODE_ENV:original.nodeEnv})){
      if(key===undefined)delete process.env[name];else process.env[name]=key;
    }
  }
});
