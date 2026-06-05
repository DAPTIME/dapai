
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS images_generated_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS images_generated_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date;

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
     OR NEW.pro_messages_used IS DISTINCT FROM OLD.pro_messages_used
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.recovery_question IS DISTINCT FROM OLD.recovery_question
     OR NEW.recovery_answer_hash IS DISTINCT FROM OLD.recovery_answer_hash
     OR NEW.images_generated_today IS DISTINCT FROM OLD.images_generated_today
     OR NEW.images_generated_date IS DISTINCT FROM OLD.images_generated_date THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;
  RETURN NEW;
END;
$function$;
