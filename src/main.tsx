import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { previewIsolationBlockReason } from './utils/previewSafety';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const blockReason = previewIsolationBlockReason({
  hostname: window.location.hostname,
  vercelEnvironment: import.meta.env.VITE_VERCEL_ENV,
  isolatedStagingConfirmed: import.meta.env.VITE_STAGING_ISOLATED,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLIC_KEY,
});

if (blockReason) {
  // Do NOT import App, Supabase, Auth or the SettingsProvider for unsafe
  // previews: merely hiding buttons would leave database effects running.
  root.render(
    <StrictMode>
      <main dir="rtl" style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#080810', color: '#fff', padding: 24,
        fontFamily: 'Cairo, system-ui, sans-serif',
      }}>
        <section style={{
          maxWidth: 540, textAlign: 'center', padding: '32px 24px',
          borderRadius: 20, border: '1px solid rgba(255,255,255,.15)',
          background: '#141425',
        }}>
          <h1 style={{ fontSize: 23, margin: '0 0 12px' }}>
            نسخة الاختبار متوقفة لحماية بيانات المستخدمين
          </h1>
          <p style={{ lineHeight: 1.9, color: '#ddd' }}>
            {blockReason}
            {' '}مش هنسمح بتسجيل حسابات أو تنفيذ مدفوعات أو مكالمات
            من المعاينة قبل توصيلها ببيئة تجريبية منفصلة.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: '#aaa' }}>
            نسخة الإنتاج لم تتغير. مسؤول المشروع يقدر يراجع
            تعليمات PREVIEW_ENVIRONMENT_ISOLATION.md قبل تفعيل المعاينة.
          </p>
        </section>
      </main>
    </StrictMode>
  );
} else {
  // Import application modules only after Preview environment verification.
  // Production and local development are unaffected by this safety check.
  void Promise.all([
    import('react-router-dom'),
    import('./context/SettingsContext'),
    import('./App.tsx'),
  ]).then(([{ BrowserRouter }, { SettingsProvider }, { default: App }]) => {
    root.render(
      <StrictMode>
        <BrowserRouter>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </BrowserRouter>
      </StrictMode>
    );
  }).catch((error: unknown) => {
    console.error('Application load failed:', error);
    root.render(<p role="alert" dir="rtl" style={{ padding: 24 }}>
      تعذر تحميل التطبيق. حاول تحديث الصفحة.
    </p>);
  });
}
