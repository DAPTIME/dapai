ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET password_reset_required = true;

-- Keep users from flipping this flag themselves.
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.tier IS DISTINCT FROM OLD.tier
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