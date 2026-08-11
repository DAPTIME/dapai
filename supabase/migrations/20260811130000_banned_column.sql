-- A banned checkbox on profiles, wired to the ban Supabase Auth already has.
--
-- The admin console bans by calling auth.admin.updateUserById with a
-- ban_duration, which writes auth.users.banned_until. That works but is
-- invisible from the table editor, and a second, unrelated "banned" flag on
-- profiles would just be a way for the two to disagree.
--
-- So: profiles.banned is the checkbox, and a trigger mirrors it into
-- auth.users.banned_until — the same column the Auth API sets. Ticking it
-- stops Supabase issuing or refreshing tokens for that account.
--
-- One caveat worth stating plainly: an access token already in someone's
-- browser stays cryptographically valid until it expires, so banned_until
-- alone would leave a window of up to an hour. The server also checks this
-- column on every authenticated request, which closes that window.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.banned IS
  'Blocks sign-in and every authenticated request. Mirrored into auth.users.banned_until by a trigger. Not writable by the account it belongs to.';

-- ── Nobody un-bans themselves ───────────────────────────────────────────
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
     OR NEW.banned IS DISTINCT FROM OLD.banned
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
     OR NEW.banned IS DISTINCT FROM false
     OR NEW.pro_messages_used IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Cannot set privileged fields on insert';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Mirror into auth.users.banned_until ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_banned_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE auth.users
     SET banned_until = CASE WHEN NEW.banned THEN 'infinity'::timestamptz ELSE NULL END
   WHERE id = NEW.id
     AND banned_until IS DISTINCT FROM
         (CASE WHEN NEW.banned THEN 'infinity'::timestamptz ELSE NULL END);
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_banned_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_banned ON public.profiles;
CREATE TRIGGER profiles_sync_banned
  AFTER INSERT OR UPDATE OF banned ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_banned_state();

-- Anyone already banned through the console keeps that state, so the column
-- starts out agreeing with auth.users rather than silently un-banning them.
UPDATE public.profiles p
SET banned = true
FROM auth.users u
WHERE u.id = p.id
  AND u.banned_until IS NOT NULL
  AND u.banned_until > now()
  AND p.banned IS DISTINCT FROM true;

-- The one account this was asked for.
UPDATE public.profiles
SET banned = true
WHERE lower(email) = lower('hassan_mahmood_1@hotmail.com');

-- ── Dashboard surface ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin.users AS
SELECT
  u.id,
  u.email,
  p.name,
  p.tier,
  COALESCE(p.site_admin, false) AS is_admin,
  COALESCE(p.banned, false) AS banned,
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

  IF COALESCE(new.banned, false) AND COALESCE(new.is_admin, old.is_admin, false) THEN
    RAISE EXCEPTION
      'That account is an admin. Untick site_admin before banning it, so the ban is a deliberate two-step.';
  END IF;

  UPDATE public.profiles
     SET name       = COALESCE(new.name, name),
         tier       = COALESCE(new.tier, tier),
         site_admin = COALESCE(new.is_admin, site_admin),
         banned     = COALESCE(new.banned, banned)
   WHERE id = old.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'No profile row for % — the account exists in auth.users but was never given a profile.', old.email;
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION admin.set_banned(p_email text, p_banned boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_admin boolean;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No account with the email %.', p_email;
  END IF;

  SELECT site_admin INTO v_admin FROM public.profiles WHERE id = v_id;
  IF p_banned AND COALESCE(v_admin, false) THEN
    RAISE EXCEPTION
      'That account is an admin. Clear site_admin before banning it.';
  END IF;

  UPDATE public.profiles SET banned = p_banned WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile row for % — nothing to set.', p_email;
  END IF;

  RETURN format('%s %s.', p_email, CASE WHEN p_banned THEN 'is banned' ELSE 'is no longer banned' END);
END;
$$;

DROP TRIGGER IF EXISTS users_update ON admin.users;
CREATE TRIGGER users_update
  INSTEAD OF UPDATE ON admin.users
  FOR EACH ROW EXECUTE FUNCTION admin.users_update();

REVOKE ALL ON admin.users FROM public, anon, authenticated;
GRANT SELECT, UPDATE ON admin.users TO postgres, service_role;
REVOKE ALL ON FUNCTION admin.set_banned(text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin.set_banned(text, boolean) TO postgres, service_role;
