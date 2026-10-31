update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']::text[]
where id = 'avatars';

drop policy if exists "Give users access to own folder 1oj01fe_0" on storage.objects;
drop policy if exists "Give users access to own folder 1oj01fe_1" on storage.objects;
drop policy if exists "Give users access to own folder 1oj01fe_2" on storage.objects;
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_select_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

create policy avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (select auth.uid()) is not null
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy avatars_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (select auth.uid()) is not null
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy avatars_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (select auth.uid()) is not null
  and (select auth.uid())::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and (select auth.uid()) is not null
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (select auth.uid()) is not null
  and (select auth.uid())::text = (storage.foldername(name))[1]
);