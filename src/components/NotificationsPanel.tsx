import { useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';

const iconMap: Record<string, string> = {
  gift: '🎁', follow: '👤', match: '💫', message: '💬',
  system: '📢', like: '❤️',
};

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { notifications, unreadCount, loading, markAllRead } = useNotifications();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 480, background: '#0f0f1a', borderRadius: '20px 20px 0 0',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>✕</button>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>
            الإشعارات {unreadCount > 0 && <span style={{ background: '#e11d48', borderRadius: 99, padding: '2px 8px', fontSize: 12 }}>{unreadCount}</span>}
          </h3>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 13, cursor: 'pointer' }}>
              تحديد الكل كمقروء
            </button>
          )}
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>جاري التحميل...</div>
          )}
          {!loading && notifications.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
              <p>لا توجد إشعارات</p>
            </div>
          )}
          {notifications.map((n: any) => (
            <div key={n.id} style={{
              padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'flex-start', gap: 14,
              background: n.is_read ? 'transparent' : 'rgba(124,58,237,0.08)',
              direction: 'rtl'
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, background: 'rgba(124,58,237,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0
              }}>
                {iconMap[n.type] || '📢'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: '#fff', fontSize: 14, fontWeight: n.is_read ? 400 : 700 }}>{n.title}</p>
                {n.body && <p style={{ margin: '4px 0 0', color: '#888', fontSize: 12 }}>{n.body}</p>}
                <p style={{ margin: '4px 0 0', color: '#555', fontSize: 11 }}>
                  {new Date(n.created_at).toLocaleString('ar')}
                </p>
              </div>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', flexShrink: 0, marginTop: 4 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
