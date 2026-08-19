// ── Helper Functions ─────────────────────────────────────────────

import type { Profile } from '../types';

export const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}س`;
  return `${Math.floor(h / 24)}ي`;
};

export const initials = (p?: Profile | null): string =>
  (p?.full_name || p?.username || '?')[0].toUpperCase();

// ── التحقق من صورة الملف الشخصي قبل الرفع ─────────────────────────
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Returns a safe extension derived from the MIME type. The original file name
// is never used to build a storage path.
export const validateAvatarFile = (file: File): { ext: string | null; error: string } => {
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { ext: null, error: 'الصور المسموح بها: JPG أو PNG أو WEBP أو GIF فقط' };
  if (file.size > AVATAR_MAX_BYTES) return { ext: null, error: 'حجم الصورة يجب أن يكون أقل من 5 ميجابايت' };
  return { ext, error: '' };
};

// ── دالة تشغيل تأثير نغمة الرادار الإلكترونية ──────────────────────
export const playRadarSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.4);

    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.3);
    }, 110);
  } catch {
    // non-fatal
  }
};
