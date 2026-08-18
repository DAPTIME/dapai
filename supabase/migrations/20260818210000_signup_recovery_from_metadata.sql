-- Copy the recovery question from signup metadata onto the profile row.
--
-- When the deployment has no service-role key, signup falls back to plain
-- auth.signUp: the account is created with the recovery question and the
-- salted answer hash riding in raw_user_meta_data, because nothing without
-- the key may write profiles' privileged columns (the privilege guard
-- refuses them for ordinary callers, by design).
--
-- This closes the loop from inside the database, where no key is needed.
-- The trigger fires after the row lands in auth.users; the profiles row is
-- created by the existing signup trigger, and same-event triggers fire in
-- name order, so the zz_ prefix is load-bearing — it puts this copy after
-- the row it updates exists.
--
-- Only fills empty fields, never overwrites: a question set through the
-- real flow must not lose to stale metadata.

CREATE OR REPLACE FUNCTION public.copy_recovery_from_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q text := NEW.raw_user_meta_data ->> 'recovery_question';
  h text := NEW.raw_user_meta_data ->> 'recovery_answer_hash';
BEGIN
  IF q IS NOT NULL AND h IS NOT NULL THEN
    UPDATE public.profiles
       SET recovery_question = COALESCE(recovery_question, q),
           recovery_answer_hash = COALESCE(recovery_answer_hash, h)
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.copy_recovery_from_metadata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_signup_recovery_from_metadata ON auth.users;
CREATE TRIGGER zz_signup_recovery_from_metadata
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.copy_recovery_from_metadata();

-- Accounts created through the fallback before this trigger existed.
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE public.profiles p
     SET recovery_question = COALESCE(p.recovery_question, u.raw_user_meta_data ->> 'recovery_question'),
         recovery_answer_hash = COALESCE(p.recovery_answer_hash, u.raw_user_meta_data ->> 'recovery_answer_hash')
    FROM auth.users u
   WHERE u.id = p.id
     AND p.recovery_question IS NULL
     AND u.raw_user_meta_data ->> 'recovery_question' IS NOT NULL
     AND u.raw_user_meta_data ->> 'recovery_answer_hash' IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'backfilled recovery question for % fallback signup(s)', n;
END $$;
