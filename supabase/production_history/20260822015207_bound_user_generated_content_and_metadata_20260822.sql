alter table public.messages
  add constraint messages_content_length_check check (message is not null and char_length(btrim(message)) between 1 and 2000);

alter table public.private_messages
  add constraint private_messages_content_length_check check (char_length(btrim(message)) between 1 and 2000);

alter table public.stream_chat
  add constraint stream_chat_content_length_check check (char_length(btrim(message)) between 1 and 2000),
  add constraint stream_chat_username_length_check check (char_length(username) between 1 and 50);

alter table public.live_streams
  add constraint live_stream_title_length_check check (char_length(btrim(title)) between 1 and 120),
  add constraint live_stream_name_length_check check (streamer_name is null or char_length(streamer_name) between 1 and 50);

alter table public.signals
  add constraint signals_type_length_check check (type is not null and char_length(btrim(type)) between 1 and 50),
  add constraint signals_data_size_check check (data is not null and pg_column_size(data) <= 65536);

alter table public.stream_bans
  add constraint stream_bans_reason_length_check check (reason is null or char_length(reason) <= 500);

alter table public.gift_logs
  add constraint gift_logs_type_length_check check (char_length(btrim(gift_type)) between 1 and 80);

alter table public.gifts
  add constraint gifts_type_length_check check (char_length(btrim(gift_type)) between 1 and 80);

alter table public.transactions
  add constraint transactions_meta_size_check check (pg_column_size(meta) <= 16384);

alter table app_private.profiles
  add constraint profiles_username_length_check check (char_length(btrim(username)) between 1 and 50),
  add constraint profiles_full_name_length_check check (full_name is null or char_length(full_name) <= 100),
  add constraint profiles_avatar_url_length_check check (avatar_url is null or char_length(avatar_url) <= 2048),
  add constraint profiles_looking_for_length_check check (looking_for is null or char_length(looking_for) <= 100);