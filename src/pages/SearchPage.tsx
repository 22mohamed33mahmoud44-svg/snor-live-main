import { useState } from 'react';
import { useSearch } from '../hooks/useSearch';

export default function SearchPage({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'profiles' | 'streams'>('profiles');
  const { profileResults, streamResults, loading, search, clear } = useSearch();

  const handleSearch = (q: string) => {
    setQuery(q);
    if (q.length >= 2) search(q);
    else clear();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#0a0a12', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>←</button>
        <input
          autoFocus
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="ابحث عن مستخدم أو بث..."
          style={{
            flex: 1, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 12,
            padding: '10px 16px', color: '#fff', fontSize: 15, direction: 'rtl', outline: 'none'
          }}
        />
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {(['profiles', 'streams'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', background: 'none', border: 'none',
            color: tab === t ? '#7c3aed' : '#666', fontSize: 14, cursor: 'pointer',
            borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent'
          }}>
            {t === 'profiles' ? '👤 أشخاص' : '📺 بثوث'}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, direction: 'rtl' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>جاري البحث...</div>}
        {tab === 'profiles' && profileResults.map((p: any) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, overflow: 'hidden' }}>
              {p.avatar_url ? <img src={p.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '👤'}
            </div>
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 700 }}>{p.username}</p>
              <p style={{ margin: '2px 0 0', color: '#888', fontSize: 12 }}>{p.followers_count} متابع {p.is_online ? '🟢' : ''}</p>
            </div>
          </div>
        ))}
        {tab === 'streams' && streamResults.map((s: any) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: 60, height: 44, borderRadius: 10, background: '#1a1a2e', overflow: 'hidden', flexShrink: 0 }}>
              {s.thumbnail_url && <img src={s.thumbnail_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
            </div>
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>{s.title}</p>
              <p style={{ margin: '2px 0 0', color: '#888', fontSize: 12 }}>{s.streamer_name} · {s.viewers_count} مشاهد</p>
            </div>
          </div>
        ))}
        {!loading && query.length >= 2 && profileResults.length === 0 && streamResults.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <p>لا توجد نتائج لـ "{query}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
