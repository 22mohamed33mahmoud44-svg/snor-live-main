import { useState } from 'react';
import { supabase } from '../supabase';

const REASONS = [
  { key: 'spam',                   label: 'سبام أو إزعاج' },
  { key: 'harassment',             label: 'تحرش أو إساءة' },
  { key: 'inappropriate_content',  label: 'محتوى غير لائق' },
  { key: 'hate_speech',            label: 'كلام كراهية' },
  { key: 'scam',                   label: 'نصب أو احتيال' },
  { key: 'other',                  label: 'أخرى' },
];

interface ReportUserButtonProps {
  reportedId?: string;
  streamId?: string;
  onClose?: () => void;
}

export default function ReportUserButton({ reportedId, streamId, onClose }: ReportUserButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setLoading(true);
    const { data } = await supabase.rpc('submit_report', {
      p_reported_id: reportedId || null,
      p_stream_id: streamId || null,
      p_reason: selectedReason,
      p_description: description || null,
    });
    setLoading(false);
    setDone(true);
    setTimeout(() => { setShowModal(false); setDone(false); onClose?.(); }, 2000);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, padding: '8px 14px', color: '#ef4444',
          fontSize: 13, cursor: 'pointer', fontWeight: 600,
        }}
      >
        🚨 إبلاغ
      </button>

      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: '#0f0f1a', borderRadius: 20, padding: 24, maxWidth: 360, width: '100%',
            border: '1px solid rgba(239,68,68,0.2)', direction: 'rtl',
          }} onClick={e => e.stopPropagation()}>
            {done ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 16 }}>تم إرسال البلاغ</p>
                <p style={{ color: '#888', fontSize: 13 }}>شكراً لمساعدتنا</p>
              </div>
            ) : (
              <>
                <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 17 }}>🚨 إبلاغ عن مخالفة</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {REASONS.map(r => (
                    <button key={r.key} onClick={() => setSelectedReason(r.key)} style={{
                      background: selectedReason === r.key ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                      border: selectedReason === r.key ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, padding: '10px 14px', color: selectedReason === r.key ? '#ef4444' : '#ccc',
                      fontSize: 14, cursor: 'pointer', textAlign: 'right', fontWeight: selectedReason === r.key ? 700 : 400,
                    }}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="تفاصيل إضافية (اختياري)..."
                  rows={3}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                    padding: 12, color: '#fff', fontSize: 13, resize: 'none',
                    outline: 'none', boxSizing: 'border-box', marginBottom: 16,
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowModal(false)} style={{
                    flex: 1, padding: '10px 0', background: 'rgba(255,255,255,0.06)',
                    border: 'none', borderRadius: 12, color: '#888', cursor: 'pointer', fontSize: 14,
                  }}>إلغاء</button>
                  <button onClick={handleSubmit} disabled={!selectedReason || loading} style={{
                    flex: 2, padding: '10px 0',
                    background: selectedReason ? '#ef4444' : 'rgba(239,68,68,0.3)',
                    border: 'none', borderRadius: 12, color: '#fff',
                    cursor: selectedReason ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700,
                  }}>
                    {loading ? '⏳' : '🚨 إرسال البلاغ'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
