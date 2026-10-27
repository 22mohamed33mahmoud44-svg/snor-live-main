# Snor Live

منصة بث مباشر ومحادثات مرئية وصوتية تفاعلية مبنية باستخدام React وTypeScript وVite مع Supabase وLiveKit وStripe.

## متطلبات التشغيل المحلي

1. تثبيت الاعتماديات:
   ```bash
   npm install
   ```
2. نسخ ملف متغيرات البيئة وتعبئة القيم الخاصة بمشروعك:
   ```bash
   cp .env.example .env
   ```
   المتغيرات المطلوبة في `.env`:
   - `VITE_SUPABASE_URL`: رابط مشروع Supabase
   - `VITE_SUPABASE_ANON_KEY`: المفتاح العام (Anon Key) لمشروع Supabase
   - `VITE_LIVEKIT_URL`: رابط خادم LiveKit (`wss://...`)
   - `VITE_TURN_URL`: رابط دالة جلب بيانات خادم TURN
   - `VITE_TURN_USERNAME`: اسم مستخدم TURN الافتراضي
   - `VITE_TURN_CREDENTIAL`: كلمة مرور TURN الافتراضية

3. تشغيل خادم التطوير:
   ```bash
   npm run dev
   ```

## التحقق من الجاهزية والبناء

- فحص الأنواع (TypeScript):
  ```bash
  npm run typecheck
  ```
- التحقق من جاهزية النشر وتطابق دوال قاعدة البيانات (RPCs):
  ```bash
  npm run verify:deploy
  ```
- بناء نسخة الإنتاج:
  ```bash
  npm run build
  ```

## إعدادات النشر على Vercel

التطبيق موجود في المجلد الجذري للمستودع مباشرة:
- اضبط **Root Directory** في Vercel على `.` (الجذر الرئيسي).
- يعتمد البناء تلقائياً على إعدادات `vercel.json` (`npm ci` ثم `npm run build` ومجلد الإخراج `dist`).

## الدوال السحابية (Supabase Edge Functions)

توجد 4 دوال سحابية في `supabase/functions/`:
- `create-checkout`: إنشاء جلسة دفع عبر Stripe لشراء باقات العملات (`pkg_100`, `pkg_500`, `pkg_1000`).
- `stripe-webhook`: استقبال إشعارات الدفع من Stripe وإضافة العملات لحساب المستخدم.
- `livekit-token`: توليد رمز الاتصال بغرف البث والمكالمات في LiveKit.
- `get-turn-credentials`: توليد بيانات اتصال خادم TURN لاتصالات WebRTC.1. تثبيت الاعتماديات:
   ```bash
   npm install
   ```
2. نسخ ملف متغيرات البيئة وتعبئة القيم الخاصة بمشروعك:
   ```bash
   cp .env.example .env
   ```
   المتغيرات المطلوبة في `.env`:
   - `VITE_SUPABASE_URL`: رابط مشروع Supabase
   - `VITE_SUPABASE_ANON_KEY`: المفتاح العام (Anon Key) لمشروع Supabase
   - `VITE_LIVEKIT_URL`: رابط خادم LiveKit (`wss://...`)
   - `VITE_TURN_URL`: رابط دالة جلب بيانات خادم TURN
   - `VITE_TURN_USERNAME`: اسم مستخدم TURN الافتراضي
   - `VITE_TURN_CREDENTIAL`: كلمة مرور TURN الافتراضية

3. تشغيل خادم التطوير:
   ```bash
   npm run dev
   ```

## التحقق من الجاهزية والبناء

- فحص الأنواع (TypeScript):
  ```bash
  npm run typecheck
  ```
- التحقق من جاهزية النشر وتطابق دوال قاعدة البيانات (RPCs):
  ```bash
  npm run verify:deploy
  ```
- بناء نسخة الإنتاج:
  ```bash
  npm run build
  ```

## إعدادات النشر على Vercel

التطبيق موجود في المجلد الجذري للمستودع مباشرة:
- اضبط **Root Directory** في Vercel على `.` (الجذر الرئيسي).
- يعتمد البناء تلقائياً على إعدادات `vercel.json` (`npm ci` ثم `npm run build` ومجلد الإخراج `dist`).

## الدوال السحابية (Supabase Edge Functions)

توجد 4 دوال سحابية في `supabase/functions/`:
- `create-checkout`: إنشاء جلسة دفع عبر Stripe لشراء باقات العملات (`pkg_100`, `pkg_500`, `pkg_1000`).
- `stripe-webhook`: استقبال إشعارات الدفع من Stripe وإضافة العملات لحساب المستخدم.
- `livekit-token`: توليد رمز الاتصال بغرف البث والمكالمات في LiveKit.
- `get-turn-credentials`: توليد بيانات اتصال خادم TURN لاتصالات WebRTC. Live

## Vercel deployment

The application is located at the repository root. Configure Vercel with **Root Directory = `.`** (repository root), then use the committed `vercel.json` build settings.

## Supabase migrations

Production database migration history must remain synchronized with `supabase/migrations`. Do not reset production to reconcile migration history; reconcile missing migration files first.
