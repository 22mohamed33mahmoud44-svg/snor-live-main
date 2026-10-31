// Build mandatory insert values for the actual app_private.profiles schema.
// Username and avatar_url are NOT NULL even when the onboarding screen does
// not collect a username and makes the profile photograph optional.
// A skipped optional photo must not erase an existing avatar during a
// partial-profile onboarding update. New inserts get avatar_url='' below.
export function onboardingProfileChanges(
  fields: { birthdate: string; gender: string; lookingFor: string },
  uploadedAvatarUrl: string | null,
) {
  return {
    gender: fields.gender,
    birthdate: fields.birthdate,
    looking_for: fields.lookingFor,
    ...(uploadedAvatarUrl ? { avatar_url: uploadedAvatarUrl } : {}),
  };
}

export type NewProfileInput = {
  username?: string;
  gender?: string;
  birthdate?: string;
  avatar_url?: string | null;
};

export function newProfileRequiredFields(userId: string, fields: NewProfileInput) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId)) {
    throw new Error('Invalid profile user ID');
  }
  if (!fields.gender || !fields.birthdate) {
    throw new Error('Cannot create a profile without gender and birthdate');
  }

  // Deterministic, collision-free for distinct UUID user IDs; users may
  // customize the name later. Never derive an identifier from an email.
  const username = fields.username?.trim() || `user_${userId.toLowerCase().replace(/-/g, '')}`;
  if (username.length > 50) throw new Error('Profile username is too long');

  return {
    username,
    avatar_url: fields.avatar_url ?? '',
    gender: fields.gender,
    birthdate: fields.birthdate,
  };
}
