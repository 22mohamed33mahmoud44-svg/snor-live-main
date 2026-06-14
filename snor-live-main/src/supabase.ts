import { createClient } from '@supabase/supabase-js'

// قراءة المفاتيح من ملف الـ .env إلزامياً لمنع تسريبها في الـ Frontend
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// تشيك سريع عشان لو نسيت تكتبهم في الـ .env المشروع ينبهك فوراً أثناء التطوير
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '❌ عذراً يا هندسة: الـ Supabase URL أو Anon Key مش مقرويين! تأكد من إنشاء ملف .env في الفولدر الرئيسي وكتابتهم جواه.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
})