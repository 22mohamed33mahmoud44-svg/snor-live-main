import { useState } from 'react';
import type { SettingsPanelProps } from '../types';
import { LogoutIcon } from './icons/Icons';

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
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f0f0ff' }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
    {type === 'toggle' && (
      <input type="checkbox" checked={checked} onChange={onChange} style={{
        appearance: 'none', width: 44, height: 26, borderRadius: 13,
        background: checked ? 'linear-gradient(135deg,#7c3aed,#00d4ff)' : 'rgba(255,255,255,.1)',
        position: 'relative', cursor: 'pointer', outline: 'none', border: 'none',
        flexShrink: 0, transition: 'background .25s'
      }} />
    )}
    {type === 'arrow' && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    )}
    {type === 'badge' && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {badge && <span style={{ background: 'rgba(239,68,68,.1)', color: '#f87171', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>{badge}</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </div>
    )}
  </div>
);

// ── Section Block ────────────────────────────────────────────────
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, color: 'rgba(0,212,255,.5)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', margin: '18px 0 10px' }}>
      {title}
    </div>
    <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 18, padding: '0 16px' }}>
      {children}
    </div>
  </div>
);

// ── Main Component ───────────────────────────────────────────────
export default function SettingsPanel({ onClose, myProfile, onLogout, onOpenEdit }: SettingsPanelProps) {
  const [notif,     setNotif]     = useState(true);
  const [sound,     setSound]     = useState(true);
  const [liveNotif, setLiveNotif] = useState(false);
  const [discover,  setDiscover]  = useState(true);
  const [hideOnline,setHideOnline]= useState(false);
  const [dark,      setDark]      = useState(true);
  const [neon,      setNeon]      = useState(true);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 850, backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'flex-end', direction: 'rtl' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', background: '#07070f', borderTop: '1px solid rgba(255,255,255,.08)', borderRadius: '28px 28px 0 0', padding: '0 0 max(28px,env(safe-area-inset-bottom)) 0', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Drag Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f0f0ff' }}>الإعدادات</span>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✕</button>
        </div>

        {/* Profile Card */}
        <div style={{ margin: '0 16px 16px', padding: '16px', borderRadius: 20, background: 'linear-gradient(135deg,rgba(124,58,237,.12),rgba(0,212,255,.07))', border: '1px solid rgba(0,212,255,.15)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 58, height: 58, borderRadius: 18, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
            {myProfile?.avatar_url
              ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (myProfile?.full_name || 'م')[0].toUpperCase()
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f0f0ff', marginBottom: 2 }}>{myProfile?.full_name || 'مستخدم سنور'}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,.4)' }}>@{myProfile?.username || 'username'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <span style={{ background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.2)', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>● متصل</span>
              <span style={{ background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.2)', color: '#00d4ff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>موثق ✓</span>
            </div>
          </div>
          <button type="button" onClick={onOpenEdit} style={{ padding: '9px 18px', borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#00d4ff)', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            تعديل
          </button>
        </div>

        {/* Stats */}
        <div style={{ margin: '0 16px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { val: '2.4k', label: 'دقيقة بث',   color: '#00d4ff' },
            { val: '540',  label: 'زيارة الملف', color: '#a855f7' },
            { val: '128',  label: 'متابع',        color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 16, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, background: `linear-gradient(135deg,#fff,${s.color})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Settings Sections */}
        <div style={{ padding: '0 16px' }}>

          <Section title="🔔 الإشعارات">
            <SettingRow icon="💬" iconBg="rgba(0,212,255,.1)"   label="تنبيهات الرسائل"      desc="إشعار عند وصول رسالة جديدة"  checked={notif}     onChange={() => setNotif(!notif)} />
            <SettingRow icon="🔊" iconBg="rgba(168,85,247,.1)" label="الأصوات والمؤثرات"    desc="نغمات البث والرادار"          checked={sound}     onChange={() => setSound(!sound)} />
            <SettingRow icon="📡" iconBg="rgba(74,222,128,.1)" label="إشعارات البث المباشر" desc="تنبيه عند بدء بث جديد"        checked={liveNotif} onChange={() => setLiveNotif(!liveNotif)}
              type="toggle"
            />
          </Section>

          <Section title="🔒 الخصوصية والأمان">
            <SettingRow icon="🌐" iconBg="rgba(0,212,255,.1)"   label="الظهور في الرادار"  desc="يسمح للآخرين باكتشافك"          checked={discover}   onChange={() => setDiscover(!discover)} />
            <SettingRow icon="👁️" iconBg="rgba(168,85,247,.1)" label="إخفاء آخر ظهور"     desc="لا يرى أحد متى كنت متصل"        checked={hideOnline} onChange={() => setHideOnline(!hideOnline)} />
            <div style={{ borderBottom: 'none' }}>
              <SettingRow icon="🚫" iconBg="rgba(239,68,68,.1)" label="قائمة الحظر" desc="إدارة المستخدمين المحظورين" type="badge" badge={3} />
            </div>
          </Section>

          <Section title="🎨 المظهر والواجهة">
            <SettingRow icon="🌙" iconBg="rgba(168,85,247,.1)" label="الوضع الليلي"   desc="خلفية داكنة مريحة للعين" checked={dark} onChange={() => setDark(!dark)} />
            <SettingRow icon="✨" iconBg="rgba(0,212,255,.1)"  label="تأثيرات النيون" desc="إضاءة وتوهج الواجهة"     checked={neon} onChange={() => setNeon(!neon)} />
          </Section>

          <Section title="⚙️ الحساب">
            <SettingRow icon="🌍" iconBg="rgba(245,158,11,.1)" label="اللغة"          desc="العربية"    type="arrow" />
            <SettingRow icon="📞" iconBg="rgba(0,212,255,.1)"  label="جودة المكالمات" desc="HD تلقائي"  type="arrow" />
            <div style={{ borderBottom: 'none' }}>
              <SettingRow icon="ℹ️" iconBg="rgba(74,222,128,.1)" label="عن التطبيق" desc="الإصدار 2.1.0" type="arrow" />
            </div>
          </Section>

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            style={{ width: '100%', marginTop: 8, padding: '15px', borderRadius: 16, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)', color: '#f87171', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
          >
            <LogoutIcon /> تسجيل خروج آمن
          </button>

        </div>
      </div>
    </div>
  );
}
