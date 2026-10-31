-- Sync the storage buckets/policies required by Camber Bot's storage migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('thumbnails','thumbnails',true,10485760,array['image/jpeg','image/png','image/webp']),
  ('gifts','gifts',true,20971520,array['image/jpeg','image/png','image/webp','image/gif','video/mp4'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Keep the existing avatar ownership policies intact; add only the public-read policy required by the application.
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "thumbnails public read" on storage.objects;
create policy "thumbnails public read"
  on storage.objects for select
  using (bucket_id = 'thumbnails');

drop policy if exists "thumbnails owner upload" on storage.objects;
create policy "thumbnails owner upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "thumbnails owner update" on storage.objects;
create policy "thumbnails owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "thumbnails owner delete" on storage.objects;
create policy "thumbnails owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "gifts public read" on storage.objects;
create policy "gifts public read"
  on storage.objects for select
  using (bucket_id = 'gifts');