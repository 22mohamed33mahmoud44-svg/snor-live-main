import { useState, lazy, Suspense } from 'react';
import { useDailyBonus } from '../hooks/useDailyBonus';
import { useNotifications } from '../hooks/useNotifications';

const NotificationsPanel = lazy(() => import('./NotificationsPanel'));
const MissionsPage = lazy(() => import('../pages/MissionsPage'));
const VIPPage = lazy(() => import('../pages/VIPPage'));
const SearchPage = lazy(() => import('../pages/SearchPage'));

export default function CamberFeaturesMenu() {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'notifications' | 'missions' | 'vip' | 'search' | null>(null);
  const { unreadCount } = useNotifications();
  const { claimBonus } = useDailyBonus();

  const closePanel = () => setPanel(null);

  const claimDailyBonus = async () => {
    try {
      const result = await claimBonus();
      if (result?.success) alert(`🎁 تم استلام المكافأة: +${result.coins ?? 0} 🪙`);
      else if (result?.message) alert(result.message);
    } catch (error) {
      console.error('Daily bonus error:', error);
      alert('تعذر استلام المكافأة الآن. حاول مرة أخرى.');
    }
  };

  return (
    <>
      <div style={{ position: 'fixed', right: 16, bottom: 88, zIndex: 2400, direction: 'rtl' }}>
        {open && (
          <div style={{ marginBottom: 10, width: 190, padding: 10, borderRadius: 18, background: 'rgba(15,15,26,.96)', border: '1px solid rgba(124,58,237,.35)', boxShadow: '0 16px 45px rgba(0,0,0,.45)', backdropFilter: 'blur(16px)' }}>
            {[
              ['notifications', `🔔 الإشعارات${unreadCount > 0 ? ` (${unreadCount})` : ''}`],
              ['missions', '🎯 المهام'],
              ['vip', '💎 VIP'],
              ['search', '🔎 البحث'],
            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setPanel(key as typeof panel); setOpen(false); }} style={{ width: '100%', textAlign: 'right', border: 0, background: 'transparent', color: '#fff', padding: '11px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
                {label}
              </button>
            ))}
            <button type="button" onClick={claimDailyBonus} style={{ width: '100%', textAlign: 'right', border: 0, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', padding: '11px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              🎁 مكافأة اليوم
            </button>
          </div>
        )}
        <button type="button" aria-label="ميزات Camber Bot" onClick={() => setOpen(v => !v)} style={{ width: 54, height: 54, borderRadius: '50%', border: '1px solid rgba(255,255,255,.15)', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', boxShadow: '0 10px 30px rgba(124,58,237,.35)', cursor: 'pointer', fontSize: 22 }}>
          {open ? '✕' : '✨'}
        </button>
      </div>

      {panel && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, zIndex: 2999, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.65)', color: '#fff' }}>جاري التحميل...</div>}>
          {panel === 'notifications' && <NotificationsPanel onClose={closePanel} />}
          {panel === 'missions' && <MissionsPage onClose={closePanel} />}
          {panel === 'vip' && <VIPPage onClose={closePanel} />}
          {panel === 'search' && <SearchPage onClose={closePanel} />}
        </Suspense>
      )}
    </>
  );
}
