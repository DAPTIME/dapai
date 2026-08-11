-- Exactly one admin, enforced by the database.
--
-- Nothing was wrong when this was written: a full pass over auth.users
-- showed one admin row, on pancholiadevansh@gmail.com, and 'user' on all
-- seventeen other accounts. This is not a repair, it is a lock. Admin can
-- read every chat, reset any password and delete any account, so the set of
-- people who hold it should not be able to grow by accident — a mis-click in
-- the Table Editor, a stray INSERT, a future migration copied from an older
-- one.
--
-- The rule keys on the email address. If the owner ever changes that address,
-- this function has to change with it, or the next grant will be refused and
-- the existing row will be the only thing keeping the console open.

-- Any admin row that is not the owner's. Expected to remove nothing.
DELETE FROM public.user_roles r
WHERE r.role = 'admin'
  AND r.user_id NOT IN (
    SELECT id FROM auth.users
    WHERE lower(email) = lower('pancholiadevansh@gmail.com')
  );

CREATE OR REPLACE FUNCTION public.enforce_single_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  IF NEW.role <> 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = NEW.user_id;

  IF v_email IS DISTINCT FROM lower('pancholiadevansh@gmail.com') THEN
    RAISE EXCEPTION
      'The admin role is reserved for the site owner. To change who that is, edit public.enforce_single_admin().';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_single_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_single_admin ON public.user_roles;
CREATE TRIGGER user_roles_single_admin
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_admin();
