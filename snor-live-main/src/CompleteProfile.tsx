import { useState } from 'react';
import { supabase } from './supabase';
// Assuming a translation hook or prop exists, e.g. from a context
// For this example, we'll imagine a `t` object with strings is available.

interface CompleteProfileProps {
  userId: string;
  onComplete: () => void;
}

export default function CompleteProfile({ userId, onComplete }: CompleteProfileProps) {
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // For demonstration, let's assume `t` is the translation object for this component
  const t = { validationError: 'من فضلك اكمل كل البيانات', submit: 'ابدأ الآن 🚀', submitting: 'جاري الحفظ...' };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatar(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!username || !gender || !birthdate) {
      setMessage(t.validationError);
      return;
    }
    
    setLoading(true);
    setMessage(''); // مسح أي خطأ سابق عند بدء المحاولة الجديدة

    try {
      let avatar_url = '';

      // 1. رفع الصورة
      if (avatar) {
        const fileExt = avatar.name.split('.').pop();
        const fileName = `${userId}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, avatar, { upsert: true });
          
        if (uploadError) throw uploadError; // رمي الخطأ للـ catch
        
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        avatar_url = data.publicUrl;
      }

      // 2. الحفظ في قاعدة البيانات باستخدام upsert لتجنب تعارض البيانات
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        username: username,
        full_name: username, // إضافة الاسم الكامل بناءً على تقرير الأداء
        gender: gender,
        birthdate: birthdate,
        avatar_url: avatar_url,
      });

      if (error) throw error; // رمي الخطأ للـ catch

      // 3. النجاح التام
      onComplete();

    } catch (error: any) {
      // 4. اصطياد أي خطأ في الرفع أو قاعدة البيانات وعرضه للمستخدم
      setMessage(error.message || 'حدث خطأ غير متوقع أثناء الحفظ.');
    } finally {
      // 5. إيقاف التحميل دائماً، سواء نجحت أو فشلت العملية
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a1a] flex items-center justify-center p-5 font-['Cairo']" dir="rtl">
      <div className="bg-gray-900 rounded-2xl p-10 w-full max-w-md">
        <h2 className="text-white text-3xl font-bold text-center mb-2">
          أكمل بروفايلك 👤
        </h2>
        <p className="text-gray-400 text-center mb-8">
          خطوة واحدة وتبدأ
        </p>

        {message && (
          <p className="text-red-400 text-center mb-4">{message}</p>
        )}

        {/* صورة شخصية */}
        <div className="text-center mb-6">
          <label htmlFor="avatarInput" className="cursor-pointer">
            <div className="w-24 h-24 rounded-full bg-gray-800 mx-auto mb-3 cursor-pointer overflow-hidden border-2 border-cyan-400 flex items-center justify-center">
            {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
            ) : (
                <span className="text-4xl" role="img" aria-label="Camera icon">📷</span>
            )}
            </div>
            <span className="text-cyan-400 text-sm">
              اضغط لرفع صورة
            </span>
          </label>
          <input id="avatarInput" type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </div>

        {/* الاسم */}
        <input
          type="text"
          placeholder="الاسم"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full bg-gray-800 text-white p-3.5 rounded-lg border border-gray-700 mb-4 text-right text-base focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition"
        />

        {/* النوع */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setGender('ذكر')}
            className={`flex-1 p-3.5 rounded-lg cursor-pointer text-base font-bold transition-colors ${gender === 'ذكر' ? 'bg-cyan-400 text-black' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
          >👨 ذكر</button>
          <button
            onClick={() => setGender('أنثى')}
            className={`flex-1 p-3.5 rounded-lg cursor-pointer text-base font-bold transition-colors ${gender === 'أنثى' ? 'bg-pink-400 text-black' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
          >👩 أنثى</button>
        </div>

        {/* تاريخ الميلاد */}
        <input
          type="date"
          value={birthdate}
          onChange={e => setBirthdate(e.target.value)}
          className="w-full bg-gray-800 text-white p-3.5 rounded-lg border border-gray-700 mb-6 text-base focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition"
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-cyan-400 text-black p-4 rounded-lg font-bold text-lg cursor-pointer hover:bg-cyan-300 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
        >{loading ? t.submitting : t.submit}</button>
      </div>
    </div>
  );
}