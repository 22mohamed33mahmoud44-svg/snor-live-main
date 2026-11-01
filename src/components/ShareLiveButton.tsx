import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { buildLiveInviteUrl } from '../utils/liveInvite.mjs';

interface ShareLiveButtonProps {
  streamId: string;
  title?: string;
  compact?: boolean;
}

// Native share on mobile, clipboard on desktop. The invitation only allows
// entering a live stream as a spectator; publishing requires server approval.
export default function ShareLiveButton({ streamId, title = 'بث مباشر على Snor Live', compact = false }: ShareLiveButtonProps) {
  const [feedback, setFeedback] = useState('');
  const handleShare = async () => {
    setFeedback('');
    let url: string;
    try {
      url = buildLiveInviteUrl(window.location.origin, streamId);
    } catch {
      setFeedback('رابط البث غير صالح');
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title, text: 'تعال اتفرج على البث المباشر في Snor Live', url });
        setFeedback('تمت مشاركة رابط البث');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Sharing unsupported by current device/app: copy the invitation.
      }
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setFeedback('تم نسخ رابط البث');
    } catch {
      // Some browsers deny clipboard permission. Allow manual selection.
      window.prompt('انسخ رابط البث وشاركه مع أصحابك', url);
      setFeedback('رابط البث جاهز للمشاركة');
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', pointerEvents: 'auto', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => void handleShare()}
        aria-label="مشاركة رابط البث المباشر"
        title="دعوة أصحابك لمشاهدة البث"
        style={{
          width: compact ? 36 : 44, height: compact ? 36 : 44,
          borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(0,0,0,0.55)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          backdropFilter: 'blur(12px)', touchAction: 'manipulation',
        }}
      >
        <Share2 size={compact ? 17 : 20} />
      </button>
      {feedback && (
        <span role="status" style={{
          position: 'absolute', bottom: compact ? 40 : 50, left: '50%', transform: 'translateX(-50%)',
          whiteSpace: 'nowrap', borderRadius: 10, padding: '7px 10px', fontSize: 11,
          color: '#fff', background: 'rgba(14,116,144,0.95)', zIndex: 40,
        }}>{feedback}</span>
      )}
    </div>
  );
}
