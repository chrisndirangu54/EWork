import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { FreelanceService } from '../src/freelance/freelance.service';

const buyer = { id: 'buyer', role: 'CLIENT', name: 'Buyer', email: 'buyer@example.org', status: 'ACTIVE' } as any;
const outsider = { ...buyer, id: 'unrelated' };
const sellerUser = { ...buyer, id: 'seller-user', role: 'FREELANCER' };
const administrator = { ...buyer, id: 'admin', role: 'ADMIN' };

function fixture() {
  let calls = 0;
  const seller = { id: 'seller-1', userId: sellerUser.id, status: 'VERIFIED', displayName: 'Sample Seller' };
  const gig = { id: 'gig-1', status: 'PUBLISHED', sellerId: seller.id, seller,
    title: 'Integration service',
    packages: [{ id: 'package-1', gigId: 'gig-1', tier: 'BASIC',
      priceCents: 10000, currency: 'USD', revisions: 2, deliveryDays: 7 }] };
  const order = { id: 'order-1', buyerId: buyer.id, sellerId: seller.id,
    seller, status: 'REQUESTED', gig: {id: gig.id,title:gig.title},
    package: {id:'package-1',tier:'BASIC',description:'Scope'}, dispute: null, review: null,
    revisionLimit:2,revisionsUsed:0,priceCents:10000,commissionCents:1200,currency:'USD' };
  const db = {
    freelanceSeller: {
      findUnique: async ({where}:any)=>where.userId === sellerUser.id ? seller : null,
      create: async ({data}:any)=>({ id:'applied',status:'PENDING',...data }),
      updateMany: async ()=>({count:1}),
      findMany: async ()=>[],
    },
    freelanceGig: {
      findFirst: async ({where}:any)=>where.id === gig.id ? gig : null,
      findUnique: async ({where}:any)=>where.id === gig.id ? gig : null,
      create: async ({data}:any)=>({id:'draft',status:'DRAFT',...data}),
    },
    freelanceOrder: {
      findUnique: async ({where}:any)=>where.id === order.id ? order : null,
      create: async ({data}:any)=>{calls++;return {id:'created',status:'REQUESTED',...data};},
      updateMany: async ()=>({count:1}),
      findMany: async ()=>[],
    },
    freelanceReview: {findUnique: async ()=>null,create: async ({data}:any)=>data},
    freelanceMessage: {findMany: async ()=>[],create: async ({data}:any)=>data},
    auditLog: {create: async ()=>({})},
  };
  return { service: new FreelanceService(db as any), calls:()=>calls, seller, gig, order };
}

test('applications take identity from authenticated user, not request body', async()=>{
  const {service}=fixture();
  const created=await service.applySeller(buyer,{
    userId:'admin',displayName:'Engineer',headline:'Cloud engineer',
    biography:'I develop enterprise apps',country:'Kenya',skills:'TypeScript'
  }) as any;
  assert.equal(created.userId,buyer.id);
  assert.equal(created.status,'PENDING');
});

test('unverified seller cannot publish gig or create offers', async()=>{
  const {service}=fixture();
  await assert.rejects(service.createGig(buyer,{
    title:'Service',description:'Description',category:'Software',tags:'React',packages:[{
      tier:'BASIC',description:'Scope',priceCents:10000,currency:'USD',deliveryDays:7,revisions:1,
    }]
  }));
});

test('buyers cannot buy their own gigs or substitute package IDs',async()=>{
  const {service}=fixture();
  await assert.rejects(service.createOrder(sellerUser,{gigId:'gig-1',packageId:'package-1',buyerBrief:'Scope'}));
  await assert.rejects(service.createOrder(buyer,{gigId:'gig-1',packageId:'other',buyerBrief:'Scope'}));
});

test('valid request locks price, currency and commission as a snapshot without collecting money',async()=>{
  const {service,calls}=fixture();
  const created=await service.createOrder(buyer,{gigId:'gig-1',packageId:'package-1',buyerBrief:'Deliver a site'}) as any;
  assert.equal(created.priceCents,10000);
  assert.equal(created.commissionCents,1200);
  assert.equal(created.sellerNetCents,8800);
  assert.equal(created.currency,'USD');
  assert.equal(calls(),1);
});

test('order details and messages are not visible to unrelated accounts', async()=>{
  const {service}=fixture();
  await assert.rejects(service.getOrder(outsider,'order-1'));
  await assert.rejects(service.messages(outsider,'order-1'));
});

test('buyers cannot accept an order as a seller, and sellers cannot cancel as buyers',async()=>{
  const {service}=fixture();
  await assert.rejects(service.respondToOrder(buyer,'order-1',true));
  await assert.rejects(service.cancelRequest(sellerUser,'order-1'));
});

test('only administrators approve sellers and resolve marketplace disputes',async()=>{
  const {service}=fixture();
  await assert.rejects(service.verifySeller(buyer,'seller-1',{approved:true}));
  await assert.rejects(service.adminDisputes(sellerUser));
  await assert.rejects(service.resolveDispute(buyer,'dispute-1',{decision:'CANCEL'}));
  await assert.rejects(service.verifySeller(administrator,'seller-1',{approved:'yes'}));
});

test('duplicate and invalid package tiers reject before any create operation',async()=>{
  const {service}=fixture();
  const payload={title:'React work',description:'Build app',category:'Software',
    tags:'react', packages:[{tier:'BASIC',description:'Scope',priceCents:10000,currency:'USD',deliveryDays:7,revisions:1},
      {tier:'BASIC',description:'Other',priceCents:15000,currency:'USD',deliveryDays:9,revisions:0}]};
  await assert.rejects(service.createGig(sellerUser,payload));
});

test('review requires a completed order and verified rating',async()=>{
  const {service}=fixture();
  await assert.rejects(service.leaveReview(buyer,'order-1',{rating:5,comment:'Great'}));
});
