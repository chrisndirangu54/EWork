import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CommercePaymentService, verifyFlutterwaveSignature,
  verifyFlutterwaveV3Secret, verifyTransactionMatch } from '../src/commerce/commerce-payment.service';

const secret = 'a-very-long-random-value-for-webhook-verification';
test('v3 provider webhook secret matches only exact configured hash', () => {
  assert.equal(verifyFlutterwaveV3Secret(secret, secret), true);
  assert.equal(verifyFlutterwaveV3Secret('invalid', secret), false);
  assert.equal(verifyFlutterwaveV3Secret(undefined, secret), false);
});
test('v4 provider webhook HMAC binds exact raw payload and rejects tampering', () => {
  const payload=Buffer.from('{"type":"charge.completed","data":{"id":1001}}');
  const signature=createHmac('sha256', secret).update(payload).digest('base64');
  assert.equal(verifyFlutterwaveSignature(payload,signature,secret),true);
  assert.equal(verifyFlutterwaveSignature(Buffer.from('{}'),signature,secret),false);
  assert.equal(verifyFlutterwaveSignature(payload,'bad',secret),false);
});
test('provider verification requires exact reference, currency, successful status and amount',()=>{
  const source={reference:'TGS_abc',currency:'KES',amountCents:123450};
  const incoming={id:123,tx_ref:'TGS_abc',amount:1234.50,currency:'KES',status:'successful'};
  assert.doesNotThrow(()=>verifyTransactionMatch(incoming,source));
  assert.throws(()=>verifyTransactionMatch({...incoming,tx_ref:'different'},source));
  assert.throws(()=>verifyTransactionMatch({...incoming,currency:'USD'},source));
  assert.throws(()=>verifyTransactionMatch({...incoming,amount:1235.50},source));
  assert.throws(()=>verifyTransactionMatch({...incoming,status:'pending'},source));
});
test('provider is disabled by default and live payments cannot be enabled via env flags', async()=>{
  const oldMode=process.env.PAYMENTS_MODE, oldKey=process.env.FLW_SECRET_KEY;
  try {
    process.env.PAYMENTS_MODE='LIVE';
    process.env.FLW_SECRET_KEY='FLWSECK_live_fake';
    const service = new CommercePaymentService({} as any);
    assert.equal(service.status().livePaymentsEnabled,false);
    assert.equal(service.status().actualPayoutsEnabled,false);
    await assert.rejects(service.initiate({id:'u1',email:'client@example.org',name:'Client',role:'CLIENT'} as any,
      {kind:'FREELANCE_ORDER',resourceId:'ae4eaaa4-1aaa-4caa-aaca-123412341234'}));
  } finally {
    if(oldMode===undefined)delete process.env.PAYMENTS_MODE;else process.env.PAYMENTS_MODE=oldMode;
    if(oldKey===undefined)delete process.env.FLW_SECRET_KEY;else process.env.FLW_SECRET_KEY=oldKey;
  }
});
