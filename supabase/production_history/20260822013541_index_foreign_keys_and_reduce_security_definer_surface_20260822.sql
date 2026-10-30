-- Cover newly normalized foreign keys.
CREATE INDEX IF NOT EXISTS live_streams_user_id_idx ON public.live_streams(user_id);
CREATE INDEX IF NOT EXISTS matches_user1_idx ON public.matches(user1);
CREATE INDEX IF NOT EXISTS matches_user2_idx ON public.matches(user2);
CREATE INDEX IF NOT EXISTS messages_match_id_idx ON public.messages(match_id);
CREATE INDEX IF NOT EXISTS stream_chat_user_id_idx ON public.stream_chat(user_id);

-- These operations can safely run as the caller because table RLS/grants already enforce ownership.
ALTER FUNCTION public.ban_user_from_stream(uuid,uuid,text) SECURITY INVOKER;
ALTER FUNCTION public.cancel_waiting(uuid) SECURITY INVOKER;
ALTER FUNCTION public.end_match(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_user_conversations(uuid) SECURITY INVOKER;
ALTER FUNCTION public.update_stream_heartbeat(uuid) SECURITY INVOKER;