/*
# Migration 018: Supabase Storage — Avatars Bucket + Thumbnails Bucket (Fixed)
# =====================================================================
# Fix: Added DROP POLICY IF EXISTS before every CREATE POLICY
#      to make this migration fully idempotent (safe for Preview & re-runs)
*/

-- ── 1. Create Storage Buckets ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',    'avatars',    true, 5242880,   ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('thumbnails', 'thumbnails', true, 10485760,  ARRAY['image/jpeg','image/png','image/webp']),
  ('gifts',      'gifts',      true, 20971520,  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. RLS: avatars bucket ──
DROP POLICY IF EXISTS "avatars public read"   ON storage.objects;
DROP POLICY IF EXISTS "avatars owner upload"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner delete"  ON storage.objects;

CREATE POLICY "avatars public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. RLS: thumbnails bucket ──
DROP POLICY IF EXISTS "thumbnails public read"   ON storage.objects;
DROP POLICY IF EXISTS "thumbnails owner upload"  ON storage.objects;
DROP POLICY IF EXISTS "thumbnails owner update"  ON storage.objects;
DROP POLICY IF EXISTS "thumbnails owner delete"  ON storage.objects;

CREATE POLICY "thumbnails public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "thumbnails owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'thumbnails' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "thumbnails owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'thumbnails' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "thumbnails owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'thumbnails' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 4. RLS: gifts bucket ──
DROP POLICY IF EXISTS "gifts public read" ON storage.objects;

CREATE POLICY "gifts public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gifts');
