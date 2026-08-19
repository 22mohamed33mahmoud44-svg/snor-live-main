import { supabase } from '../supabase';

const AVATARS_BUCKET = 'avatars';

const extensionFor = (file: Blob): string => {
  if (file instanceof File) {
    const ext = file.name.split('.').pop();
    if (ext) return ext.toLowerCase();
  }
  const subtype = file.type.split('/')[1];
  return subtype || 'jpg';
};

/**
 * يرفع صورة الملف الشخصي ويعيد رابطها العام.
 * Storage RLS requires the first path segment to equal auth.uid().
 */
export const uploadAvatar = async (userId: string, file: Blob): Promise<string> => {
  const path = `${userId}/avatar-${Date.now()}.${extensionFor(file)}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return publicUrl;
};
