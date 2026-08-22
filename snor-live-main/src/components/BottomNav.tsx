export default function BottomNav({ onSearch, onMissions, onVIP, onNotifications, unreadCount }: {
  onSearch: () => void;
  onMissions: () => void;
  onVIP: () => void;
  onNotifications: () => void;
  unreadCount: number;
}) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2000,
      background: 'rgba(10,10,18,0.97)', borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '10px 0 max(10px, env(safe-area-inset-bottom))',
    }}>
      {([
        { icon: '🔍', label: 'بحث',     onClick: onSearch },
        { icon: '🎯', label: 'مهام',     onClick: onMissions },
        { icon: '⭐', label: 'VIP',      onClick: onVIP },
        { icon: '🔔', label: 'إشعارات', onClick: onNotifications, badge: unreadCount },
      ] as { icon: string; label: string; onClick: () => void; badge?: number }[]).map(item => (
        <button key={item.label} onClick={item.onClick} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          position: 'relative', padding: '4px 12px'
        }}>
          <span style={{ fontSize: 22 }}>{item.icon}</span>
          <span style={{ color: '#888', fontSize: 10 }}>{item.label}</span>
          {(item.badge || 0) > 0 && (
            <span style={{
              position: 'absolute', top: 0, right: 6,
              background: '#e11d48', borderRadius: 99,
              width: 16, height: 16, fontSize: 9, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800
            }}>{item.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
