// This is a frontend *accident-prevention guard*, not an access-control
// substitute for production Supabase RLS or authentication.
export type PreviewSafetyInput = {
  hostname: string;
  vercelEnvironment?: string;
  isolatedStagingConfirmed?: string;
  supabaseUrl?: string;
  stripePublishableKey?: string;
};

// These are the project's verified production aliases. Any other .vercel.app
// hostname is treated as Preview if Vercel did not expose VITE_VERCEL_ENV.
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
  const isVercelPreview = input.vercelEnvironment === 'preview'
    || (hostname.endsWith('.vercel.app') && !productionHostnames.has(hostname));
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
