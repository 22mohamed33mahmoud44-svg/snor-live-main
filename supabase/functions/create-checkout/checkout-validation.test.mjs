import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGE_IDS, parseCheckoutPackage, resolveCheckoutPrice } from './checkout-validation.mjs';

const prices = Object.freeze({
  pkg_100: 'price_test_100',
  pkg_500: 'price_test_500',
  pkg_1000: 'price_test_1000',
});

test('permits exactly the three supported coin packages', () => {
  assert.deepEqual(PACKAGE_IDS, ['pkg_100', 'pkg_500', 'pkg_1000']);
  for (const id of PACKAGE_IDS) {
    assert.equal(parseCheckoutPackage({ packageId: id }), id);
    assert.equal(resolveCheckoutPrice(id, prices), prices[id]);
  }
});

test('rejects missing, malformed or non-string checkout payloads', () => {
  for (const payload of [null, undefined, 'pkg_100', 100, [], {}, { packageId: 100 },
    { packageId: null }, { packageId: [] }, { packageId: { value: 'pkg_100' } },
    { packageId: 'pkg_100 ' }, { packageId: 'pkg_999' }]) {
    assert.equal(parseCheckoutPackage(payload), null);
  }
});

test('never accepts JavaScript prototype properties as Stripe prices', () => {
  for (const maliciousId of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
    assert.equal(parseCheckoutPackage({ packageId: maliciousId }), null);
    assert.equal(resolveCheckoutPrice(maliciousId, prices), null);
  }
});

test('requires explicitly configured non-empty Stripe prices', () => {
  assert.equal(resolveCheckoutPrice('pkg_100', {}), null);
  assert.equal(resolveCheckoutPrice('pkg_100', {pkg_100: undefined}), null);
  assert.equal(resolveCheckoutPrice('pkg_100', {pkg_100: '  '}), null);
  const proto = {pkg_100: 'inherited_price'};
  assert.equal(resolveCheckoutPrice('pkg_100', Object.create(proto)), null);
});
