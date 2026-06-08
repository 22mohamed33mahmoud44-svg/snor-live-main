import { useState } from 'react';
import { supabase } from './supabase';

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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatar(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!username || !gender || !birthdate) {
      setMessage('من فضلك اكمل كل البيانات');
      return;
    }
    setLoading(true);

    let avatar_url = '';

    if (avatar) {
      const fileExt = avatar.name.split('.').pop();
      const fileName = `${userId}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatar, { upsert: true });
      if (!uploadError) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        avatar_url = data.publicUrl;
      }
    }

    const { error } = await supabase.from('profiles').insert({
      id: userId,
      username,
      gender,
      birthdate,
      avatar_url,
    });

    if (error) setMessage(error.message);
    else onComplete();
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ backgroundColor: '#111827', borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '500px' }}>
        <h2 style={{ color: 'white', fontSize: '28px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>
          أكمل بروفايلك 👤
        </h2>
        <p style={{ color: '#9ca3af', textAlign: 'center', marginBottom: '32px' }}>
          خطوة واحدة وتبدأ
        </p>

        {message && (
          <p style={{ color: '#f87171', textAlign: 'center', marginBottom: '16px' }}>{message}</p>
        )}

        {/* صورة شخصية */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            onClick={() => document.getElementById('avatarInput')?.click()}
            style={{
              width: '100px', height: '100px', borderRadius: '50%',
              backgroundColor: '#1f2937', margin: '0 auto 12px',
              cursor: 'pointer', overflow: 'hidden',
              border: '3px solid #06b6d4',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {avatarPreview ? (
              <img src={avatarPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '40px' }}>📷</span>
            )}
          </div>
          <input id="avatarInput" type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
          <p style={{ color: '#06b6d4', fontSize: '14px', cursor: 'pointer' }}
            onClick={() => document.getElementById('avatarInput')?.click()}>
            اضغط لرفع صورة
          </p>
        </div>

        {/* الاسم */}
        <input
          type="text"
          placeholder="الاسم"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ width: '100%', backgroundColor: '#1f2937', color: 'white', padding: '14px', borderRadius: '10px', border: 'none', marginBottom: '16px', textAlign: 'right', fontSize: '16px', boxSizing: 'border-box' }}
        />

        {/* النوع */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <button
            onClick={() => setGender('ذكر')}
            style={{ flex: 1, padding: '14px', borderRadius: '10px', border: 'none', cursor: 'pointer', backgroundColor: gender === 'ذكر' ? '#06b6d4' : '#1f2937', color: gender === 'ذكر' ? 'black' : 'white', fontSize: '16px', fontWeight: 'bold' }}
          >👨 ذكر</button>
          <button
            onClick={() => setGender('أنثى')}
            style={{ flex: 1, padding: '14px', borderRadius: '10px', border: 'none', cursor: 'pointer', backgroundColor: gender === 'أنثى' ? '#f472b6' : '#1f2937', color: gender === 'أنثى' ? 'black' : 'white', fontSize: '16px', fontWeight: 'bold' }}
          >👩 أنثى</button>
        </div>

        {/* تاريخ الميلاد */}
        <input
          type="date"
          value={birthdate}
          onChange={e => setBirthdate(e.target.value)}
          style={{ width: '100%', backgroundColor: '#1f2937', color: 'white', padding: '14px', borderRadius: '10px', border: 'none', marginBottom: '24px', fontSize: '16px', boxSizing: 'border-box' }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', backgroundColor: '#06b6d4', color: 'black', padding: '16px', borderRadius: '10px', border: 'none', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer' }}
        >{loading ? 'جاري الحفظ...' : 'ابدأ الآن 🚀'}</button>
      </div>
    </div>
  );
}
