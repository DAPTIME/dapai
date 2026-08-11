-- Give the owner account back its admin role, and make the grant self-healing.
--
-- The original bootstrap (20260602173410) read public.profiles:
--
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM public.profiles WHERE lower(email) = ...
--
-- That only works if the owner had already signed up by the time it ran.
-- Pointing the app at a fresh Supabase project replays every migration
-- against an empty database, so the SELECT matched nothing, the owner signed
-- up afterwards, handle_new_user gave them 'user' like everybody else, and
-- /admin told the person who owns the site that their account is not
-- authorized.
--
-- Three parts here: backfill any profile rows the trigger missed, grant admin
-- from auth.users (which is authoritative even when profiles is out of sync),
-- and teach handle_new_user to do it at signup so the ordering stops
-- mattering.

-- 1. Profiles for any account that has none. A missing row here also breaks
--    the leaderboard's display name and the per-account race tuning lookup.
INSERT INTO public.profiles (id, email, name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2. The owner's roles, read from auth.users rather than profiles.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role
FROM auth.users u
CROSS JOIN (VALUES ('admin'::public.app_role), ('user'::public.app_role)) AS r(role)
WHERE lower(u.email) = lower('pancholiadevansh@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Signup-time bootstrap.
--
--    The admin branch is guarded twice: the address has to match, and no
--    admin may exist yet. Once the owner holds the role the branch can never
--    fire again, and until then the only way to reach it is to sign up with
--    an address that is already taken. Deleting the owner's account cascades
--    the role away and re-opens the bootstrap, which is what you want if the
--    account is ever rebuilt.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF lower(COALESCE(NEW.email, '')) = lower('pancholiadevansh@gmail.com')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
  THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
