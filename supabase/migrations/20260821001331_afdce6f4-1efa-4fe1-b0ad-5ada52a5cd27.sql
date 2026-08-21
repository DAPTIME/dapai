-- 1) my_messages_per_minute was executable by PUBLIC (thus anon). Lock it down.
REVOKE ALL ON FUNCTION public.my_messages_per_minute() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_messages_per_minute() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_messages_per_minute() TO authenticated, service_role;

-- 2) Defensively revoke anon EXECUTE on every SECURITY DEFINER routine in public.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 3) Study-room helpers must require a signed-in caller.
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.study_room_members m
     WHERE m.room_id = _room_id
       AND m.user_id = _user_id
       AND m.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_join_study_room(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.study_rooms
    WHERE id = _room_id AND is_open = true AND deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_room_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_join_study_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_join_study_room(uuid) TO authenticated, service_role;
