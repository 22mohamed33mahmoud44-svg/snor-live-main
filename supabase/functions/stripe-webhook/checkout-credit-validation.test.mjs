import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePaidCoinCheckout, PACKAGE_COINS } from './checkout-credit-validation.mjs';

const user = '11111111-1111-4111-8111-111111111111';
const configured = { pkg_100: 'price_real_100', pkg_500: 'price_real_500', pkg_1000: 'price_real_1000' };
const session = {
  id: 'cs_test_valid123', mode: 'payment', payment_status: 'paid',
  amount_total: 4500, client_reference_id: user,
  metadata: { user_id: user, package_id: 'pkg_500' },
};
const items = {
  has_more: false,
  data: [{ price: { id: 'price_real_500', unit_amount: 4500 }, quantity: 1, amount_total: 4500 }],
};
const credit = (s=session, l=items, p=configured) => validatePaidCoinCheckout(s,l,p);

test('credit is bound to the Stripe-confirmed price, buyer and quantity', () => {
  assert.deepEqual(credit(), {userId: user, packageId:'pkg_500',coins:500,sessionId:'cs_test_valid123'});
  assert.deepEqual(PACKAGE_COINS, {pkg_100:100,pkg_500:500,pkg_1000:1000});
  assert.deepEqual(credit({...session,client_reference_id:null}), credit(), 'older valid sessions remain supported');
});

test('mismatched or unknown Stripe price IDs never mint coins', () => {
  for (const badId of ['price_real_100','price_attacker','',null]) {
    assert.equal(credit(session,{...items,data:[{...items.data[0],price:{...items.data[0].price,id:badId}}]}),null);
  }
  assert.equal(credit(session,items,{}),null,'missing configured price must fail closed');
  assert.equal(credit(session,items,{...configured,pkg_500:'price_wrong'}),null);
});

test('bad package metadata, unknown buyer or mismatched buyer reference are rejected', () => {
  for (const package_id of ['constructor','__proto__','pkg_999','pkg_100',null,500]) {
    assert.equal(credit({...session,metadata:{user_id:user,package_id}}),null);
  }
  for (const user_id of ['not-uuid',null,'']) {
    assert.equal(credit({...session,metadata:{package_id:'pkg_500',user_id}}),null);
  }
  assert.equal(credit({...session,client_reference_id:'22222222-2222-4222-8222-222222222222'}),null);
});

test('unpaid, wrong-mode, zero-value and no-session checkouts are refused', () => {
  for (const edit of [
    {mode:'subscription'},{payment_status:'unpaid'},{payment_status:'no_payment_required'},
    {amount_total:0},{amount_total:-100},{amount_total:'4500'},{id:'not-a-checkout'},
  ]) assert.equal(credit({...session,...edit}),null);
});

test('partial discounts, extra items, multiple units and malformed totals are blocked', () => {
  const line = items.data[0];
  for (const changed of [
    {quantity:2},{quantity:0},{amount_total:0},{amount_total:100},{amount_total:'4500'},
    {price:{id:'price_real_500',unit_amount:0}},
    {price:{id:'price_real_500',unit_amount:null}},
  ]) {
    assert.equal(credit(session,{has_more:false,data:[{...line,...changed}]}),null);
  }
  assert.equal(credit(session,{has_more:true,data:[line]}),null);
  assert.equal(credit(session,{has_more:false,data:[line,line]}),null);
  assert.equal(credit(session,{has_more:false,data:[]}),null);
  assert.equal(credit({...session,amount_total:1000},items),null);
});

test('signed paid sessions with legitimate additional taxes remain valid', () => {
  assert.deepEqual(credit({...session,amount_total:4750}), credit());
});
