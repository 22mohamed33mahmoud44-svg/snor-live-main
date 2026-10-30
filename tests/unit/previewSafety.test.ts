/// <reference lib="deno.ns" />
import { previewIsolationBlockReason } from '../../src/utils/previewSafety.ts';

const preview = {
  hostname: 'snor-live-main-bh8zhquoh-22mohamed33mahmoud44-8727s-projects.vercel.app',
  vercelEnvironment: 'preview',
  supabaseUrl: 'https://ogzrothtgxupawgjbioc.supabase.co',
  stripePublishableKey: 'pk_test_dummy',
  isolatedStagingConfirmed: 'true',
};

function assertBlocked(input: Parameters<typeof previewIsolationBlockReason>[0], message: string) {
  if (!previewIsolationBlockReason(input)) throw new Error(message);
}

Deno.test('unapproved previews are blocked even when the frontend builds successfully', () => {
  assertBlocked({ ...preview, isolatedStagingConfirmed: undefined }, 'Missing staging approval');
  assertBlocked({ ...preview, isolatedStagingConfirmed: 'false' }, 'False staging approval');
});

Deno.test('production database is blocked even when staging flag says approved', () => {
  assertBlocked(preview, 'Preview still targets production Supabase');
  assertBlocked({
    ...preview, supabaseUrl: 'https://OGZROTHTGXUPAWGJBIOC.supabase.co/path',
  }, 'Case-insensitive backend host');
});

Deno.test('Stripe must be in test mode and the backend must be a valid Supabase host', () => {
  const isolated = { ...preview, supabaseUrl: 'https://independent-staging.supabase.co' };
  for (const stripePublishableKey of [undefined, '', 'pk_live_do_not_use']) {
    assertBlocked({ ...isolated, stripePublishableKey }, 'Invalid Stripe preview key');
  }
  for (const supabaseUrl of [
    '', 'http://independent-staging.supabase.co', 'not-a-url',
    'https://ogzrothtgxupawgjbioc.supabase.co.evil.test',
  ]) assertBlocked({ ...isolated, supabaseUrl }, 'Invalid staging backend');
  if (previewIsolationBlockReason(isolated) !== null) throw new Error('Valid isolated preview should load');
});

Deno.test('hostname fallback catches previews with Vercel system exposure disabled', () => {
  assertBlocked({ ...preview, vercelEnvironment: undefined, isolatedStagingConfirmed: undefined },
    'Missing VITE_VERCEL_ENV must not bypass safety check');
});

Deno.test('known production hosts and localhost stay operational without staging configuration', () => {
  for (const hostname of [
    'snorlive.com',
    'www.snorlive.com',
    'snor-live-main.vercel.app',
    'snor-live-main-22mohamed33mahmoud44-8727s-projects.vercel.app',
    'snor-live-main-git-main-22mohamed33mahmoud44-8727s-projects.vercel.app',
    'localhost',
  ]) {
    const reason = previewIsolationBlockReason({
      hostname, vercelEnvironment: hostname === 'localhost' ? undefined : 'production',
      supabaseUrl: 'https://ogzrothtgxupawgjbioc.supabase.co',
    });
    if (reason !== null) throw new Error('Production or development blocked: ' + hostname);
  }
});

Deno.test('custom-domain preview still blocked by declared Vercel preview environment', () => {
  assertBlocked({ ...preview, hostname:'review.example.com' },
    'Custom preview hostname should not bypass VERCEL_ENV');
});

Deno.test('unknown public custom domains block instead of bypassing Preview safety', () => {
  for (const hostname of ['review.snorlive.com', 'qa.example.org', 'another-example.net']) {
    assertBlocked({ ...preview, hostname, vercelEnvironment: undefined },
      'Unrecognized public hostname must not trust production connectivity');
    assertBlocked({ ...preview, hostname, vercelEnvironment: 'production' },
      'A production marker alone must not grant unknown domains trusted status');
  }
});
