-- Disposable PostgreSQL 17 fixture. Never execute on production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE MATERIALIZED VIEW public.leaderboard_most_followed AS
SELECT '11111111-1111-4111-8111-111111111111'::uuid AS user_id,
       'sample'::text AS username, 14::integer AS followers_count;
CREATE MATERIALIZED VIEW public.leaderboard_top_streamers AS
SELECT '11111111-1111-4111-8111-111111111111'::uuid AS user_id,
       'sample'::text AS username, 110::bigint AS total_gifts_received;
CREATE MATERIALIZED VIEW public.leaderboard_top_gifters AS
SELECT '11111111-1111-4111-8111-111111111111'::uuid AS user_id,
       'sample'::text AS username, 55::bigint AS total_coins_spent;

GRANT ALL PRIVILEGES ON TABLE
  public.leaderboard_most_followed,
  public.leaderboard_top_streamers,
  public.leaderboard_top_gifters
TO anon, authenticated, service_role;
