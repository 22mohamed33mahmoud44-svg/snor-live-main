import { useState } from 'react';
import { supabase } from '../supabase';

interface EditProfileModalProps {
  myProfile: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
    gender?: string;
  } | null;
  onClose: () => void;
  onProfileUpdated: (updatedProfile: any) => void;
}

export default function EditProfileModal({ myProfile, onClose, onProfileUpdated }: EditProfileModalProps) {
  const [fullName, setFullName] = useState(myProfile?.full_name || '');
  const [username, setUsername] = useState(myProfile?.username || '');
  const [gender, setGender] = useState(myProfile?.gender || 'male');
  const [avatarUrl, setAvatarUrl] = useState(myProfile?.avatar_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setErrorMsg('');
      if (!e.target.files || e.target.files.length === 0) return;
      setUploading(true);

      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${myProfile?.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل في رفع الصورة، تأكد من الصلاحيات.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!username.trim() || !fullName.trim()) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      setErrorMsg('');
      setSaving(true);

      const updatedData = {
        id: myProfile?.id,
        full_name: fullName,
        username: username.toLowerCase().replace(/\s+/g, '_'),
        gender,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(updatedData);

      if (error) throw error;

      onProfileUpdated(updatedData);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ البيانات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContainerStyle} onClick={e => e.stopPropagation()}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>تعديل الملف الشخصي</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {errorMsg && <p style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center', marginBottom: 16 }}>{errorMsg}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={avatarOuterStyle}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{(fullName || 'أ')[0].toUpperCase()}</span>
            )}
          </div>
          
          <label style={uploadLabelStyle}>
            {uploading ? 'جاري الرفع...' : '🔀 تغيير الصورة الشخصية'}
            <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} style={{ display: 'none' }} />
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>الاسم بالكامل</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="مثال: محمد محمود" style={inputStyle} />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>اسم المستخدم (Username)</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="مثال: mohamed_fadel" style={inputStyle} />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>الجنس</label>
            <select value={gender} onChange={e => setGender(e.target.value)} style={selectStyle}>
              <option value="male">ذكر 👨</option>
              <option value="female">أنثى 👩</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={handleSave} disabled={saving || uploading} style={saveBtnStyle}>
            {saving ? 'جاري الحفظ...' : '💾 حفظ التعديلات الآمنة'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── PREMIUM INLINE STYLES (تم تصليح الأخطاء بالكامل هنا) ──
const modalOverlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(5,5,10,0.8)', zIndex: 950, backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, direction: 'rtl', color: '#fff' };
const modalContainerStyle: React.CSSProperties = { width: '100%', maxWidth: 420, background: '#0a0a16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' };
const closeBtnStyle: React.CSSProperties = { width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const avatarOuterStyle: React.CSSProperties = { position: 'relative', width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
const uploadLabelStyle: React.CSSProperties = { fontSize: '0.82rem', fontWeight: 600, color: '#00d4ff', cursor: 'pointer', background: 'rgba(0,212,255,0.08)', padding: '6px 14px', borderRadius: 12, border: '1px solid rgba(0,212,255,0.15)' };
const inputGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelStyle: React.CSSProperties = { fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 };
const inputStyle: React.CSSProperties = { padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, color: '#fff', fontSize: '0.9rem', outline: 'none' };
const selectStyle: React.CSSProperties = { padding: '12px 16px', background: '#0a0a16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, color: '#fff', fontSize: '0.9rem', outline: 'none', cursor: 'pointer' };
const saveBtnStyle: React.CSSProperties = { flex: 1, padding: 14, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', border: 'none', borderRadius: 14, color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,212,255,0.25)' };