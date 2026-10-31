create or replace function public.ban_user_from_stream(p_stream_id uuid, p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security invoker
set search_path to pg_catalog
as $$
declare v_streamer_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('success',false,'error','unauthenticated');
  end if;
  if p_stream_id is null or p_user_id is null then
    return jsonb_build_object('success',false,'error','invalid_input');
  end if;

  select user_id into v_streamer_id
  from public.live_streams
  where id=p_stream_id and is_live=true;

  if v_streamer_id is null then
    return jsonb_build_object('success',false,'error','stream_not_found');
  end if;
  if auth.uid() <> v_streamer_id then
    return jsonb_build_object('success',false,'error','not_authorized');
  end if;
  if auth.uid() = p_user_id then
    return jsonb_build_object('success',false,'error','cannot_ban_self');
  end if;

  insert into public.stream_bans(stream_id,user_id,banned_by,reason)
  values(p_stream_id,p_user_id,auth.uid(),nullif(left(coalesce(p_reason,''),500),''))
  on conflict(stream_id,user_id) do nothing;

  return jsonb_build_object('success',true);
exception
  when foreign_key_violation then
    return jsonb_build_object('success',false,'error','user_not_found');
  when others then
    return jsonb_build_object('success',false,'error','database_error');
end;
$$;