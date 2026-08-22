import React from 'react';
import { Users, Heart, X, UserPlus, UserCheck } from 'lucide-react';

interface LiveHeaderProps {
  streamerName: string;
  streamerId?: string;
  myUserId: string;
  isFollowing: boolean | null;
  followLoading: boolean;
  viewersCount: number;
  likesCount: number;
  onToggleFollow: (e: React.MouseEvent) => void;
  onExit: () => void;
}

// دالة ذكية لتنسيق الأرقام لمنع اهتزاز الواجهة (مثال: 1500 تصبح 1.5K)
const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const LiveHeader = ({
  streamerName,
  streamerId,
  myUserId,
  isFollowing,
  followLoading,
  viewersCount,
  likesCount,
  onToggleFollow,
  onExit
}: LiveHeaderProps) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'env(safe-area-inset-top)', pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
      
      {/* معلومات المذيع وزر المتابعة */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.45)', padding: '4px 14px 4px 4px', borderRadius: '50px', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>
          {streamerName?.[0]?.toUpperCase() ?? '🎙️'}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {streamerName}
          </span>
        </div>
        
        {streamerId && streamerId !== myUserId && (
          <button 
            onClick={onToggleFollow} 
            disabled={followLoading || isFollowing === null} 
            style={{ marginLeft: 4, background: isFollowing ? 'rgba(255,255,255,0.12)' : '#ff2a74', border: isFollowing ? '1px solid rgba(255,255,255,0.25)' : 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', cursor: followLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: followLoading ? 0.6 : 1, transition: 'all 0.2s ease' }}
          >
            {isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
            {isFollowing ? 'متابع' : 'متابعة'}
          </button>
        )}
      </div>

      {/* الإحصائيات وزر الخروج */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '6px 14px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(20px)' }}>
          <Users size={12} style={{ color: '#00d4ff' }} /> 
          <span style={{ width: '28px', textAlign: 'center' }}>{formatNumber(viewersCount)}</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '6px 14px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(20px)' }}>
          <Heart size={12} style={{ color: '#ff2a74' }} fill="currentColor" /> 
          <span style={{ width: '28px', textAlign: 'center' }}>{formatNumber(likesCount)}</span>
        </div>
        <button onClick={onExit} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <X size={18} />
        </button>
      </div>
      
    </div>
  );
};

// 🛡️ درع الأداء: نمنع إعادة التصيير تماماً إلا إذا تغيرت هذه القيم المحددة
export default React.memo(LiveHeader, (prevProps, nextProps) => {
  return (
    prevProps.viewersCount === nextProps.viewersCount &&
    prevProps.likesCount === nextProps.likesCount &&
    prevProps.isFollowing === nextProps.isFollowing &&
    prevProps.followLoading === nextProps.followLoading &&
    prevProps.streamerId === nextProps.streamerId
  );
});