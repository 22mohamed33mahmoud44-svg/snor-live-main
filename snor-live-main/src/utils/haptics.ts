// ── اهتزاز خفيف للأزرار (Haptic Feedback) للموبايل ──

export const vibrate = (durationMs = 40) => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(durationMs);
};
