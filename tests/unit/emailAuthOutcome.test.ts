/// <reference lib="deno.ns" />
import { emailAuthNextStep } from '../../src/utils/emailAuthOutcome.ts';

function assert(actual: unknown, expected: unknown, name: string) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
}

Deno.test('signup without a session requires email verification, not a fake login', () => {
  assert(emailAuthNextStep(true, { user: { id: 'new-user' }, session: null }),
    'check-email', 'new email confirmation');
  // Supabase may mask an existing account with an obfuscated user object.
  assert(emailAuthNextStep(true, { user: { id: 'obfuscated' }, session: null }),
    'check-email', 'existing account enumeration protection');
});

Deno.test('signup with an active session can proceed to onboarding', () => {
  assert(emailAuthNextStep(true, { user: { id: 'new-user' }, session: { access_token: 'test' } }),
    'signed-in', 'immediately authenticated signup');
});

Deno.test('password login is complete only when Supabase returns an actual session', () => {
  assert(emailAuthNextStep(false, { user: { id: 'known-user' }, session: null }),
    'failed', 'no sign-in session');
  assert(emailAuthNextStep(false, { user: null, session: { access_token: 'test' } }),
    'signed-in', 'authenticated login session');
});

Deno.test('empty and missing auth responses never grant a session', () => {
  for (const signup of [true, false]) {
    for (const data of [undefined, null, {}, { user: null, session: null }]) {
      assert(emailAuthNextStep(signup, data), 'failed', 'empty response');
    }
  }
});
