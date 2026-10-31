import { supabase } from '../supabase';
import { newProfileRequiredFields } from './profileDefaults';

// Only explicitly editable, owner-scoped columns may be sent by the browser.
// Postgres views do not expose a primary-key constraint for a reliable
// INSERT .. ON CONFLICT upsert. Read existence first, then INSERT or UPDATE.
export type EditableProfile = {
  username?: string;
  full_name?: string;
  gender?: string;
  birthdate?: string;
  looking_for?: string;
  avatar_url?: string | null;
  hide_online?: boolean;
  show_in_radar?: boolean;
};

export async function saveOwnProfile(userId: string, fields: EditableProfile): Promise<void> {
  if (!userId) throw new Error('Missing profile user ID');

  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  // Database column avatar_url is NOT NULL even when no photo is selected.
  const normalizedFields = fields.avatar_url === null ? { ...fields, avatar_url: '' } : fields;

  const updateProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .update(normalizedFields)
      .eq('id', userId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Profile update not authorized or profile missing');
  };

  if (existing) {
    await updateProfile();
    return;
  }

  // First-time onboarding has no username field and photo is optional;
  // fill the required columns without overriding existing profiles.
  const required = newProfileRequiredFields(userId, normalizedFields);
  const { error: insertError } = await supabase
    .from('profiles')
    .insert({ id: userId, ...normalizedFields, ...required });

  if (insertError?.code === '23505') {
    // Another authenticated session might have created this user's profile.
    await updateProfile();
  } else if (insertError) {
    throw insertError;
  }
}
