import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('payment checkout remains locked at server and storefront', () => {
  const fn = readFileSync('supabase/functions/create-checkout/index.ts', 'utf8');
  const ui = readFileSync('src/BuyCoins.tsx', 'utf8');

  assert.match(fn, /const PAYMENT_CHECKOUT_RELEASED = false;/);
  const gateAt = fn.indexOf('if (!PAYMENT_CHECKOUT_RELEASED)');
  const stripeSetupAt = fn.indexOf('new Stripe(');
  const checkoutAt = fn.indexOf('stripe.checkout.sessions.create(');
  assert.ok(gateAt > 0 && gateAt < stripeSetupAt && stripeSetupAt < checkoutAt,
    'server must refuse checkout before Stripe client initialization and session creation');
  assert.match(fn.slice(gateAt, stripeSetupAt), /status: 503/);
  assert.match(fn.slice(gateAt, stripeSetupAt), /Cache-Control.*no-store/);

  assert.match(ui, /const paymentsApprovedForLaunch = false;/);
  assert.ok(ui.indexOf('if (!paymentsApprovedForLaunch)') <
            ui.indexOf('return (\n    <div'),
    'storefront must show payment unavailable notice instead of checkout UI');
});
