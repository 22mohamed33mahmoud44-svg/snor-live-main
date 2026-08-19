import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { SettingsPanelProps } from '../types';
import { logError } from '../utils/logError';
import { LogoutIcon } from './icons/Icons';
import { useSettings } from '../context/SettingsContext';
import { motion, PanInfo, AnimatePresence } from 'framer-motion';

// ── اهتزاز خفيف للأزرار (Haptic Feedback) للموبايل ──
const vibrate = () => {
  if (typeof window !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(40);
  }
};

// ── Custom Motion Toggle ─────────────────────────────────────────
const MotionToggle = ({ checked, onChange }: { checked?: boolean; onChange?: () => void }) => (
  <motion.div
    onClick={(e) => { 
      e.stopPropagation(); // 🛡️ درع حماية لمنع انتشار الضغطة للخلفية وإغلاق المودال
      vibrate(); 
      onChange?.(); 
    }}
    style={{
      width: 46, height: 26, borderRadius: 13,
      background: checked ? 'linear-gradient(135deg, #7c3aed, #00d4ff)' : 'rgba(255, 255, 255, 0.12)',
      display: 'flex', alignItems: 'center', padding: '0 3px', cursor: 'pointer',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      boxShadow: checked ? '0 0 15px rgba(0,212,255,0.3)' : 'none',
      transition: 'background 0.3s ease, box-shadow 0.3s ease'
    }}
  >
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 700, damping: 30 }}
      style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
      }}
    />
  </motion.div>
);

// ── Setting Row ──────────────────────────────────────────────────
interface SettingRowProps {
  icon: string;
  iconBg: string;
  label: string;
  desc: string;
  checked?: boolean;
  onChange?: () => void;
  type?: 'toggle' | 'arrow' | 'badge';
  badge?: string | number;
}

const SettingRow = ({ icon, iconBg, label, desc, checked, onChange, type = 'toggle', badge }: SettingRowProps) => (
  <motion.div 
    whileTap={{ scale: type !== 'toggle' ? 0.97 : 1, backgroundColor: 'rgba(255,255,255,0.03)' }}
    onClick={(e) => { 
      if (type !== 'toggle') { 
        e.stopPropagation();
        vibrate(); 
        onChange?.(); 
      } 
    }}
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 10px', borderBottom: '1px solid rgba(255,255,255,.04)', borderRadius: 12, cursor: type !== 'toggle' ? 'pointer' : 'default' }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc' }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
    
    {type === 'toggle' && <MotionToggle checked={checked} onChange={onChange} />}
    
    {type === 'arrow' && (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    )}
    
    {type === 'badge' && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {badge && <span style={{ background: 'rgba(239,68,68,.15)', color: '#fca5a5', fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 20 }}>{badge}</span>}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </div>
    )}
  </motion.div>
);

// ── Section Block ────────────────────────────────────────────────
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800, letterSpacing: '1px', margin: '0 10px 10px' }}>
      {title}
    </div>
    <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 22, padding: '4px 6px', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)' }}>
      {children}
    </div>
  </div>
);

// ── Main Component ───────────────────────────────────────────────
export default function SettingsPanel({ onClose, myProfile, onLogout, onOpenEdit }: SettingsPanelProps) {
  const { settings, updateSetting } = useSettings();
  const [stats, setStats] = useState({ minutes: 0, visits: 0, followers: 0 });

  useEffect(() => {
    if (!myProfile?.id) return;
    const fetchUserStats = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('followers_count, profile_visits, stream_minutes')
          .eq('id', myProfile.id)
          .maybeSingle();

        if (error) {
          logError('SettingsPanel.fetchUserStats', error);
          return;
        }

        if (data) {
          setStats({ minutes: data.stream_minutes || 0, visits: data.profile_visits || 0, followers: data.followers_count || 0 });
        }
      } catch (err) {
        logError('SettingsPanel.fetchUserStats', err);
      }
    };
    fetchUserStats();
  }, [myProfile?.id]);

  // 💾 معمارية حفظ جديدة مستقرة ولا تسبب وميض أو إغلاق الواجهة
  const handleToggleSetting = async (key: any, currentValue: boolean) => {
    const newValue = !currentValue;
    
    // 1. تحديث الكونتكس والواجهة فوراً لسرعة فائقة
    updateSetting(key, newValue);
    
    // 2. حفظ في الـ LocalStorage لضمان بقائها حتى لو قفل التطبيق
    localStorage.setItem(`snor_setting_${key}`, JSON.stringify(newValue));
    
    // 3. تحديث في قاعدة البيانات دون ملامسة جلسة الـ Auth العنيفة
    try {
      // supabase لا يرمي استثناءً عند فشل الاستعلام، لذلك نفحص error صريحاً
      const { error } = await supabase
        .from('profiles')
        .update({ [key]: newValue })
        .eq('id', myProfile?.id);

      if (error) logError('SettingsPanel.saveSetting', error);
    } catch (error) {
      logError('SettingsPanel.saveSetting', error);
    }
  };

  const formatNumber = (num: number) => num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num.toString();

  const handleDragEnd = (_e: any, info: PanInfo) => {
    if (info.offset.y > 150 || info.velocity.y > 500) {
      vibrate();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
        onClick={() => { vibrate(); onClose(); }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(2,2,6,.85)', zIndex: 850, backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', direction: 'rtl' }}
      >
        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          onClick={e => e.stopPropagation()}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          style={{ width: '100%', background: '#0a0a14', borderTop: '1px solid rgba(255,255,255,.08)', borderRadius: '32px 32px 0 0', padding: '0 0 max(24px,env(safe-area-inset-bottom)) 0', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', scrollbarWidth: 'none' }}
        >
          {/* Drag Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px', cursor: 'grab' }}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.2)' }} />
          </div>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px 20px' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f8fafc' }}>الإعدادات</span>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => { vibrate(); onClose(); }} style={{ width: 34, height: 34, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✕</motion.button>
          </div>

          {/* Profile Card */}
          <div style={{ margin: '0 16px 20px', padding: '16px', borderRadius: 24, background: 'linear-gradient(145deg, rgba(124,58,237,.15), rgba(0,212,255,.1))', border: '1px solid rgba(0,212,255,.2)', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 62, height: 62, borderRadius: 20, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 800, color: '#fff', flexShrink: 0, overflow: 'hidden', boxShadow: '0 4px 15px rgba(124,58,237,0.4)' }}>
              {myProfile?.avatar_url
                ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (myProfile?.full_name || 'م')[0].toUpperCase()
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', marginBottom: 3 }}>{myProfile?.full_name || 'مستخدم سنور'}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,.5)' }}>@{myProfile?.username || 'username'}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <span style={{ background: 'rgba(52,211,153,.15)', border: '1px solid rgba(52,211,153,.25)', color: '#34d399', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', animation: 'pulse 2s infinite' }} /> متصل</span>
                <span style={{ background: 'rgba(56,189,248,.15)', border: '1px solid rgba(56,189,248,.25)', color: '#38bdf8', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20 }}>موثق ✓</span>
              </div>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => { vibrate(); onOpenEdit(); }} style={{ padding: '10px 20px', borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(0,212,255,0.3)' }}>
              تعديل
            </motion.button>
          </div>

          {/* Stats */}
          <div style={{ margin: '0 16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { val: formatNumber(stats.minutes), label: 'دقيقة بث',   color: '#38bdf8' },
              { val: formatNumber(stats.visits),  label: 'زيارة الملف', color: '#c084fc' },
              { val: formatNumber(stats.followers), label: 'متابع',     color: '#fbbf24' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 20, padding: '16px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, background: `linear-gradient(135deg,#fff,${s.color})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.5px' }}>{s.val}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Settings Sections */}
          <div style={{ padding: '0 16px' }}>

            <Section title="🔔 الإشعارات">
              <SettingRow icon="💬" iconBg="rgba(56,189,248,.12)" label="تنبيهات الرسائل" desc="إشعار عند وصول رسالة جديدة" checked={!!settings?.notif} onChange={() => handleToggleSetting('notif', !!settings?.notif)} />
              <SettingRow icon="🔊" iconBg="rgba(192,132,252,.12)" label="الأصوات والمؤثرات" desc="نغمات البث والرادار" checked={!!settings?.sound} onChange={() => handleToggleSetting('sound', !!settings?.sound)} />
              <div style={{ borderBottom: 'none' }}>
                <SettingRow icon="📡" iconBg="rgba(52,211,153,.12)" label="إشعارات البث المباشر" desc="تنبيه عند بدء بث جديد" checked={!!settings?.liveNotif} onChange={() => handleToggleSetting('liveNotif', !!settings?.liveNotif)} type="toggle" />
              </div>
            </Section>

            <Section title="🔒 الخصوصية والأمان">
              <SettingRow icon="🌐" iconBg="rgba(56,189,248,.12)" label="الظهور في الرادار" desc="يسمح للآخرين باكتشافك" checked={!!settings?.discover} onChange={() => handleToggleSetting('discover', !!settings?.discover)} />
              <SettingRow icon="👁️" iconBg="rgba(192,132,252,.12)" label="إخفاء آخر ظهور" desc="لا يرى أحد متى كنت متصل" checked={!!settings?.hideOnline} onChange={() => handleToggleSetting('hideOnline', !!settings?.hideOnline)} />
              <div style={{ borderBottom: 'none' }}>
                <SettingRow icon="🚫" iconBg="rgba(248,113,113,.12)" label="قائمة الحظر" desc="إدارة المستخدمين المحظورين" type="badge" badge={0} />
              </div>
            </Section>

            <Section title="🎨 المظهر والواجهة">
              <SettingRow icon="🌙" iconBg="rgba(192,132,252,.12)" label="الوضع الليلي" desc="خلفية داكنة مريحة للعين" checked={!!settings?.dark} onChange={() => handleToggleSetting('dark', !!settings?.dark)} />
              <div style={{ borderBottom: 'none' }}>
                <SettingRow icon="✨" iconBg="rgba(56,189,248,.12)" label="تأثيرات النيون" desc="إضاءة وتوهج الواجهة" checked={!!settings?.neon} onChange={() => handleToggleSetting('neon', !!settings?.neon)} />
              </div>
            </Section>

            <Section title="⚙️ الحساب">
              <SettingRow icon="🌍" iconBg="rgba(251,191,36,.12)" label="اللغة" desc="العربية" type="arrow" />
              <SettingRow icon="📞" iconBg="rgba(56,189,248,.12)" label="جودة المكالمات" desc="HD تلقائي" type="arrow" />
              <div style={{ borderBottom: 'none' }}>
                <SettingRow icon="ℹ️" iconBg="rgba(52,211,153,.12)" label="عن التطبيق" desc="الإصدار 2.1.0 PRO" type="arrow" />
              </div>
            </Section>

            {/* Logout */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => { vibrate(); onLogout(); }}
              style={{ width: '100%', marginTop: 12, padding: '16px', borderRadius: 20, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#fca5a5', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(239,68,68,0.1)' }}
            >
              <LogoutIcon /> تسجيل خروج آمن
            </motion.button>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}