-- A site_admin checkbox on profiles, as the one place admin is decided.
--
-- Admin used to live only in public.user_roles, which meant granting it was
-- a join against auth.users and an insert into a second table. This adds a
-- boolean to the row you are already looking at in the Table Editor: false
-- for everyone, tick it for the accounts you choose.
--
-- profiles.site_admin is now the source of truth. RLS policies all over the
-- schema call has_role(auth.uid(), 'admin'), which reads user_roles, so a
-- trigger mirrors the checkbox into that table. The mirror is one-way on
-- purpose — two tables that write to each other eventually disagree, and
-- then nobody can say which one is right.
--
-- This supersedes 20260811113000_single_admin.sql, which reserved admin for
-- a single address. Choosing who is an admin is the point of the checkbox,
-- so that trigger is dropped below.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS site_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.site_admin IS
  'Opens the admin console. Source of truth for admin; mirrored into user_roles by a trigger. Not writable by the account it belongs to.';

-- Anyone who already holds the role keeps it.
UPDATE public.profiles p
SET site_admin = true
WHERE EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = p.id AND r.role = 'admin'
)
AND p.site_admin IS DISTINCT FROM true;

-- ── Nobody promotes themselves ──────────────────────────────────────────
--
-- The column-level grant is the real lock: authenticated may update only
-- (name, avatar_url) on profiles, so site_admin is unreachable over the API
-- regardless of RLS. These triggers are the second layer, and they are what
-- would catch a future migration that widens that grant by accident.

CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.site_admin IS DISTINCT FROM OLD.site_admin
     OR NEW.pro_messages_used IS DISTINCT FROM OLD.pro_messages_used
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.password_reset_required IS DISTINCT FROM OLD.password_reset_required
     OR NEW.recovery_question IS DISTINCT FROM OLD.recovery_question
     OR NEW.recovery_answer_hash IS DISTINCT FROM OLD.recovery_answer_hash THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot insert profile for another user';
  END IF;

  IF NEW.tier IS DISTINCT FROM 'free'
     OR NEW.site_admin IS DISTINCT FROM false
     OR NEW.pro_messages_used IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Cannot set privileged fields on insert';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Mirror the checkbox into user_roles ─────────────────────────────────
--
-- Dropped first: a single-address restriction would refuse the inserts this
-- trigger makes, and choosing more than one admin is the whole point.
DROP TRIGGER IF EXISTS user_roles_single_admin ON public.user_roles;
DROP FUNCTION IF EXISTS public.enforce_single_admin();

CREATE OR REPLACE FUNCTION public.sync_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.site_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id AND role = 'admin';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_admin_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_admin_role ON public.profiles;
CREATE TRIGGER profiles_sync_admin_role
  AFTER INSERT OR UPDATE OF site_admin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_role();

-- ── Signup ──────────────────────────────────────────────────────────────
--
-- The owner bootstrap now sets the column and lets the mirror create the
-- role row, so there is still exactly one place admin is decided.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bootstrap boolean;
BEGIN
  v_bootstrap :=
    lower(COALESCE(NEW.email, '')) = lower('pancholiadevansh@gmail.com')
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE site_admin);

  INSERT INTO public.profiles (id, email, name, site_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    v_bootstrap
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ── The dashboard view follows the same path ────────────────────────────
CREATE OR REPLACE VIEW admin.users AS
SELECT
  u.id,
  u.email,
  p.name,
  p.tier,
  COALESCE(p.site_admin, false) AS is_admin,
  (
    SELECT COALESCE(string_agg(r.role::text, ', ' ORDER BY r.role::text), '')
    FROM public.user_roles r WHERE r.user_id = u.id
  ) AS roles,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  u.last_sign_in_at,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

CREATE OR REPLACE FUNCTION admin.users_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admins integer;
BEGIN
  IF new.id IS DISTINCT FROM old.id THEN
    RAISE EXCEPTION 'id is read-only here.';
  END IF;

  IF new.email IS DISTINCT FROM old.email THEN
    RAISE EXCEPTION
      'Change an email under Authentication → Users, not here. The app reads profiles.email and the two must not drift apart.';
  END IF;

  IF NOT COALESCE(new.is_admin, false) AND COALESCE(old.is_admin, false) THEN
    SELECT count(*) INTO v_admins FROM public.profiles WHERE site_admin;
    IF v_admins <= 1 THEN
      RAISE EXCEPTION
        'Refusing to remove the last admin — the console would lock everyone out. Tick site_admin on another account first.';
    END IF;
  END IF;

  UPDATE public.profiles
     SET name       = COALESCE(new.name, name),
         tier       = COALESCE(new.tier, tier),
         site_admin = COALESCE(new.is_admin, site_admin)
   WHERE id = old.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'No profile row for % — the account exists in auth.users but was never given a profile.', old.email;
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION admin.set_admin(p_email text, p_is_admin boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_admins integer;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No account with the email %. They have to sign up first.', p_email;
  END IF;

  IF NOT p_is_admin THEN
    SELECT count(*) INTO v_admins FROM public.profiles WHERE site_admin;
    IF v_admins <= 1 THEN
      RAISE EXCEPTION
        'Refusing to remove the last admin — the console would lock everyone out. Make another account an admin first.';
    END IF;
  END IF;

  UPDATE public.profiles SET site_admin = p_is_admin WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile row for % — nothing to set.', p_email;
  END IF;

  RETURN format('%s %s an admin.', p_email, CASE WHEN p_is_admin THEN 'is now' ELSE 'is no longer' END);
END;
$$;

DROP TRIGGER IF EXISTS users_update ON admin.users;
CREATE TRIGGER users_update
  INSTEAD OF UPDATE ON admin.users
  FOR EACH ROW EXECUTE FUNCTION admin.users_update();

REVOKE ALL ON admin.users FROM public, anon, authenticated;
GRANT SELECT, UPDATE ON admin.users TO postgres, service_role;
REVOKE ALL ON FUNCTION admin.set_admin(text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin.set_admin(text, boolean) TO postgres, service_role;
