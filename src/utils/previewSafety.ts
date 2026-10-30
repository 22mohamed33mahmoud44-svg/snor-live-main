// This is a frontend *accident-prevention guard*, not an access-control
// substitute for production Supabase RLS or authentication.
export type PreviewSafetyInput = {
  hostname: string;
  vercelEnvironment?: string;
  isolatedStagingConfirmed?: string;
  supabaseUrl?: string;
  stripePublishableKey?: string;
};

// Verified Production aliases. All other public hostnames are treated as
// Preview/unknown deployments: this also covers custom-domain previews when
// Vercel's VITE_VERCEL_ENV is absent from the build.
const productionHostnames = new Set([
  'snorlive.com',
  'www.snorlive.com',
  'snor-live-main.vercel.app',
  'snor-live-main-22mohamed33mahmoud44-8727s-projects.vercel.app',
  'snor-live-main-git-main-22mohamed33mahmoud44-8727s-projects.vercel.app',
]);
const productionSupabaseHost = 'ogzrothtgxupawgjbioc.supabase.co';

export function previewIsolationBlockReason(input: PreviewSafetyInput): string | null {
  const hostname = input.hostname.toLowerCase();
  const localDevelopment = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1' || hostname === '[::1]';
  // Fail closed on unrecognized public hostnames, even if a platform forgot
  // to expose Vercel's environment marker or uses custom preview domains.
  const isVercelPreview = input.vercelEnvironment === 'preview'
    || (!productionHostnames.has(hostname) && !localDevelopment);
  if (!isVercelPreview) return null;

  // Explicit approval is separate from Vercel's target and cannot be supplied
  // by production's shared environment variable record.
  if (input.isolatedStagingConfirmed !== 'true') {
    return 'لا توجد إعدادات معتمدة لعزل نسخة الاختبار عن الإنتاج.';
  }
  let backendHost: string;
  try {
    const url = new URL(input.supabaseUrl ?? '');
    if (url.protocol !== 'https:') return 'عنوان خادم الاختبار غير آمن.';
    backendHost = url.hostname.toLowerCase();
  } catch {
    return 'عنوان قاعدة بيانات الاختبار غير صالح.';
  }
  if (backendHost === productionSupabaseHost) {
    return 'نسخة الاختبار ما زالت متصلة بقاعدة بيانات الإنتاج.';
  }
  if (!backendHost.endsWith('.supabase.co')) {
    return 'عنوان قاعدة بيانات الاختبار غير متوقع ويحتاج مراجعة.';
  }
  if (!input.stripePublishableKey?.startsWith('pk_test_')) {
    return 'لا توجد إعدادات Stripe Test Mode صالحة لنسخة الاختبار.';
  }
  return null;
}
