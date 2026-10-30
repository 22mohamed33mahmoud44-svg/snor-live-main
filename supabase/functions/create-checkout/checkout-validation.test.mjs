import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGE_IDS, buildCheckoutRedirects, checkoutDisplayDetails, parseCheckoutPackage, resolveCheckoutPrice } from './checkout-validation.mjs';

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

test('returns users to the session-specific, ledger-verified payment route', () => {
  assert.deepEqual(buildCheckoutRedirects('https://example.com/'), {
    successUrl: 'https://example.com/payment/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://example.com/?payment=cancelled',
  });
  assert.equal(
    buildCheckoutRedirects('https://example.com/some-path').successUrl.includes('%7B'),
    false,
    'Stripe substitution placeholder must not be URL-encoded',
  );
});

test('rejects untrusted or invalid configured app origins', () => {
  for (const base of ['javascript:alert(1)', 'http://public.example.com',
    'ftp://example.com', 'https://user:password@example.com']) {
    assert.throws(() => buildCheckoutRedirects(base));
  }
  assert.equal(
    buildCheckoutRedirects('http://localhost:5173').cancelUrl,
    'http://localhost:5173/?payment=cancelled',
  );
});

test('returns the exact amount and currency from Stripe Checkout Session', () => {
  const details = checkoutDisplayDetails({
    id: 'cs_test_verified',
    url: 'https://checkout.stripe.com/c/pay/cs_test_verified',
    amount_total: 4500,
    currency: 'egp',
  });
  assert.deepEqual(details, {
    session_id: 'cs_test_verified',
    checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_verified',
    amount_total: 4500,
    currency: 'EGP',
  });
});

test('will not quote invented, free, missing or untrusted checkout prices', () => {
  const base = {
    id: 'cs_test_valid',
    url: 'https://checkout.stripe.com/c/pay/test',
    amount_total: 4500,
    currency: 'egp',
  };
  for (const changed of [
    { amount_total: null }, { amount_total: undefined }, { amount_total: '4500' },
    { amount_total: -10 }, { amount_total: 0 }, { amount_total: 1.5 },
    { currency: null }, { currency: 'EGP
' }, { currency: 'invalid' },
    { url: 'http://checkout.stripe.com/pay/test' },
    { url: 'javascript:alert(1)' }, { url: 'https://admin:password@checkout.stripe.com' },
  ]) {
    assert.equal(checkoutDisplayDetails({ ...base, ...changed }), null);
  }
});
