-- Re-assert the privilege guard on public.profiles.
--
-- ── Why this exists, given the guard already does ───────────────────────
--
-- The security scanner reports, as Critical, that "Users can update their
-- own profile" checks only auth.uid() = id in USING and WITH CHECK, and so
-- lets any signed-in account set site_admin=true, tier='exclusive',
-- banned=false, pro_messages_used or recovery_answer_hash straight through
-- PostgREST.
--
-- Read against the policy alone, that is correct. It is not correct against
-- the schema: a BEFORE UPDATE trigger, prevent_profile_privileged_updates,
-- already refuses exactly those columns, and its current body covers tier,
-- site_admin, banned, pro_messages_used, id, email,
-- password_reset_required, recovery_question and recovery_answer_hash. The
-- scanner's own recommended remedy — "a BEFORE UPDATE trigger that resets
-- these columns to OLD values unless the update is performed by an admin" —
-- is the mechanism that is already in place. The scanner appears to read
-- policies without accounting for triggers.
--
-- So this migration changes no design. It re-asserts, idempotently:
--
--   1. the function body, so the column list is unambiguous and current
--   2. the trigger binding, because the function has been replaced several
--      times since the trigger was created and a binding that quietly went
--      missing would leave the policy standing alone — which is precisely
--      the hole the scanner describes
--   3. ENABLE on the trigger, since a disabled trigger looks identical to a
--      present one in every catalogue view people usually check
--
-- Running it when the guard is healthy is a no-op. Running it when the
-- guard is absent closes a real privilege escalation. Without live database
-- access there is no way to tell which case this is, and of the two
-- mistakes — re-asserting a working guard, or assuming a missing one is
-- fine — only the first is harmless.
--
-- ── Why not column-level grants instead ─────────────────────────────────
--
-- The scanner also offers "split these into an admin-only-writable table or
-- column set". Column privileges only bite once table-level UPDATE is
-- revoked, so taking that route means enumerating every column the app is
-- allowed to write and granting each one. Miss a column and ordinary
-- profile edits start failing in production. The trigger already covers the
-- same ground and fails closed, so this keeps one mechanism that works over
-- two that partly overlap.

CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role writes (auth.uid() IS NULL) are how the admin console sets
  -- tiers and bans, and how the server counts usage. Admins are allowed
  -- through for the same reason.
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

REVOKE ALL ON FUNCTION public.prevent_profile_privileged_updates()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_profile_privileged_updates ON public.profiles;
CREATE TRIGGER prevent_profile_privileged_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privileged_updates();

ALTER TABLE public.profiles ENABLE TRIGGER prevent_profile_privileged_updates;

-- The INSERT half, same reasoning: a fresh row must not arrive already
-- privileged.
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

REVOKE ALL ON FUNCTION public.prevent_profile_privileged_inserts()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_profile_privileged_inserts_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privileged_inserts_trg
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privileged_inserts();

ALTER TABLE public.profiles ENABLE TRIGGER prevent_profile_privileged_inserts_trg;

-- Say out loud whether this run found the guard already healthy or had to
-- restore it, so the answer is in the migration log rather than inferred.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'profiles'
     AND NOT t.tgisinternal
     AND t.tgname IN ('prevent_profile_privileged_updates',
                      'prevent_profile_privileged_inserts_trg')
     AND t.tgenabled <> 'D';

  IF n = 2 THEN
    RAISE NOTICE 'profiles privilege guard: both triggers present and enabled.';
  ELSE
    RAISE WARNING 'profiles privilege guard: expected 2 enabled triggers, found %.', n;
  END IF;
END $$;
