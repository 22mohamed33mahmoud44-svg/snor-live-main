-- Expose only the safe public-profile columns to anonymous clients.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, username, full_name, avatar_url, gender) ON public.profiles TO anon;

-- Keep signed-in users compatible with existing profile reads while owner write policies enforce mutations.
GRANT SELECT ON public.profiles TO authenticated;