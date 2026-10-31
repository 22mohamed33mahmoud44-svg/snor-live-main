// Supabase signUp may return a user with NO session while email
// confirmation is pending. The browser must not pretend this is a login.
// Avoid exposing whether the address already belongs to an existing user.
export type EmailAuthResponseShape = {
  user?: object | null;
  session?: object | null;
};

export type EmailAuthNextStep = 'signed-in' | 'check-email' | 'failed';

export function emailAuthNextStep(
  isSignUp: boolean,
  response: EmailAuthResponseShape | null | undefined,
): EmailAuthNextStep {
  if (response?.session) return 'signed-in';
  if (isSignUp && response?.user) return 'check-email';
  return 'failed';
}
