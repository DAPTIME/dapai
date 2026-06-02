
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recovery_question text,
  ADD COLUMN IF NOT EXISTS recovery_answer_hash text;

-- Block non-admins from changing these via the API; only the server (admin client) sets them.
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.pro_messages_used IS DISTINCT FROM OLD.pro_messages_used
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.recovery_question IS DISTINCT FROM OLD.recovery_question
       OR NEW.recovery_answer_hash IS DISTINCT FROM OLD.recovery_answer_hash THEN
      RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_profile_privileged_updates ON public.profiles;
CREATE TRIGGER prevent_profile_privileged_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privileged_updates();
