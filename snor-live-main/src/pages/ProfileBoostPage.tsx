import { useBoost } from '../hooks/useBoost';

const BOOST_ICONS: Record<string, string> = {
  home_page: '🏠', search_top: '🔍', radar_top: '📡',
};
const BOOST_LABELS: Record<string, string> = {
  home_page: 'الصفحة الرئيسية', search_top: 'نتائج البحث', radar_top: 'الرادار',
};

export default function ProfileBoostPage({ onClose }: { onClose: () => void }) {
  const { packages, loading, boostProfile } = useBoost();

  const grouped = packages.reduce((acc: any, p: any) => {
    if (!acc[p.boost_type]) acc[p.boost_type] = [];
    acc[p.boost_type].push(p);
    return acc;
  }, {});

  const handleBoost = async (pkgId: string) => {
    const { data } = await boostProfile(pkgId);
    if (data?.success) {
      alert(`✅ تم! ستظهر حتى ${new Date(data.expires_at).toLocaleString('ar')}`);
      onClose();
    } else {
      alert(`❌ ${data?.error === 'insufficient_coins' ? 'رصيد غير كافٍ' : data?.error === 'boost_already_active' ? 'لديك boost نشط بالفعل' : 'حدث خطأ'}`);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, background: '#0f0f1a', borderRadius: '20px 20px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>✕</button>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>🚀 برز ملفك الشخصي</h3>
          <span style={{ width: 36 }} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 16, direction: 'rtl' }}>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px', lineHeight: 1.7 }}>
            ادفع عملات واحصل على ظهور مميز في أماكن مختلفة داخل التطبيق
          </p>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>جاري التحميل...</div>}
          {Object.entries(grouped).map(([type, pkgs]: any) => (
            <div key={type} style={{ marginBottom: 24 }}>
              <h4 style={{ color: '#fff', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                {BOOST_ICONS[type]} {BOOST_LABELS[type]}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {pkgs.map((p: any) => (
                  <button key={p.id} onClick={() => handleBoost(p.id)} style={{
                    background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)',
                    borderRadius: 14, padding: '14px 8px', cursor: 'pointer', textAlign: 'center',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ color: '#a855f7', fontSize: 13, fontWeight: 800 }}>
                      {p.duration_hours === 1 ? 'ساعة' : p.duration_hours === 6 ? '6 ساعات' : 'يوم كامل'}
                    </div>
                    <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: '6px 0' }}>
                      {p.coins_cost} 🪙
                    </div>
                    <div style={{ color: '#555', fontSize: 10 }}>{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
