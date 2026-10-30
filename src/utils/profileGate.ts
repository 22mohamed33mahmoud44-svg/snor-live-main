// Keep authentication errors and incomplete profiles out of the dashboard.
// This is a UI gate, not a substitute for Supabase RLS.
export type ProfileOnboardingFields = {
  gender?: string | null;
  birthdate?: string | null;
  looking_for?: string | null;
};

const hasText = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export function requiresOnboarding(profile: ProfileOnboardingFields | null | undefined): boolean {
  return !profile || !hasText(profile.gender) || !hasText(profile.birthdate) || !hasText(profile.looking_for);
}

export function shouldShowProfileError(
  hasUser: boolean,
  profileError: string | null,
  showOnboarding: boolean,
): boolean {
  return hasUser && Boolean(profileError) && !showOnboarding;
}
