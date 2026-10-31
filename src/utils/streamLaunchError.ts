const SINGLE_ACTIVE_STREAM_INDEX = 'uq_live_streams_one_active_per_user';

export type StreamLaunchDbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/** PostgREST exposes the PostgreSQL 23505 code and constraint name. */
export function isDuplicateActiveStreamError(error: StreamLaunchDbError | null | undefined): boolean {
  return error?.code === '23505'
    && [error.message, error.details, error.hint]
      .some(value => typeof value === 'string' && value.includes(SINGLE_ACTIVE_STREAM_INDEX));
}

export function streamLaunchErrorMessage(error: StreamLaunchDbError | null | undefined): string {
  if (isDuplicateActiveStreamError(error)) {
    return 'عندك بث مباشر شغال بالفعل من جهاز تاني. أنهِ البث القديم قبل بدء بث جديد.';
  }
  return 'تعذر بدء البث على الخادم. تحقق من الإنترنت وحاول مرة أخرى.';
}
