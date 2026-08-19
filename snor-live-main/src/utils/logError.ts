// ── Error reporting helpers ───────────────────────────────────────
// نقطة واحدة لتسجيل الأخطاء حتى لا تُهمَل بصمت،
// ويمكن ربطها لاحقاً بخدمة مراقبة (Sentry مثلاً) من مكان واحد.

export const logError = (scope: string, error: unknown): void => {
  console.error(`[${scope}]`, error);
};
