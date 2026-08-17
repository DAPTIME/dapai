-- Answers to the Supabase database linter.
--
-- Four of its five findings are real and fixed here. The fifth is
-- deliberate and is documented rather than "fixed", because the only way to
-- clear it is to delete working features.

-- ── 0011: function search path mutable ──────────────────────────────────
--
-- A SECURITY DEFINER function without a pinned search_path runs whatever
-- the caller's search_path resolves its unqualified names to. Someone who
-- can create a schema and put a `profiles` table in it can then have a
-- definer function read theirs instead of ours, with the definer's rights.
--
-- Applied to every function in public rather than a list, so a function
-- added later without one is caught the next time this runs. Functions that
-- already pin it are skipped, so an explicit setting is never overwritten.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prokind = 'f'
       AND NOT EXISTS (
         SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
          WHERE c LIKE 'search\_path=%'
       )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO ''public''', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'pinned search_path on % function(s)', n;
END $$;

-- ── 0028: anon can execute SECURITY DEFINER functions ───────────────────
--
-- Revoked from every definer function whose body depends on auth.uid().
-- Those are meaningless to a signed-out caller — auth.uid() is NULL, so the
-- best case is an exception and the worst is a function that treats NULL as
-- a user. Either way anon has no business holding EXECUTE.
--
-- Scoped by what the function actually reads rather than by a hand-written
-- list, because the last blanket revoke here took the public track
-- leaderboard down with it: get_track_leaderboard is SECURITY DEFINER, is
-- meant to be readable signed-out, and does not touch auth.uid(). It keeps
-- its grant under this rule, which is the point of choosing the rule this
-- way.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prosecdef
       AND p.prosrc LIKE '%auth.uid()%'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'revoked anon EXECUTE on % definer function(s)', n;
END $$;

-- ── Room messages could not be moderated ────────────────────────────────
--
-- study_room_messages had no UPDATE or DELETE policy at all, so nobody —
-- not the host, not an admin — could take a message down through the API.
-- Fail-closed rather than a hole, but it meant a room host had no answer to
-- someone posting something they had to remove.
--
-- Delete only, and only for the host or a site admin. No UPDATE policy: an
-- edit would let a host rewrite what somebody else said under their name,
-- which is worse than leaving it up.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'study_room_messages') THEN

    DROP POLICY IF EXISTS "Hosts and admins can delete room messages"
      ON public.study_room_messages;

    CREATE POLICY "Hosts and admins can delete room messages"
      ON public.study_room_messages
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.study_rooms r
           WHERE r.id = study_room_messages.room_id
             AND r.host_id = auth.uid()
        )
        OR COALESCE(
             (SELECT p.site_admin FROM public.profiles p WHERE p.id = auth.uid()),
             false
           )
      );
  END IF;
END $$;

-- ── 0029: signed-in users can execute SECURITY DEFINER functions ────────
--
-- Not fixed, because it is the design. Every function this fires on exists
-- precisely so a signed-in user can do something their own RLS grants do
-- not allow: charge their usage ledger, take a queue ticket, submit a DAP
-- for review. Each one checks auth.uid() itself and acts only on that
-- caller's rows; the admin ones re-check site_admin inside the body, so
-- holding EXECUTE buys a non-admin nothing.
--
-- The alternatives the linter suggests both cost more than the warning:
-- SECURITY INVOKER cannot write the rows these need to write, and moving
-- them out of the exposed schema would mean the app could not call them.
-- Recorded here so the next person reading the advisor list can tell a
-- decision from an oversight.
COMMENT ON FUNCTION public.charge_usage(numeric, integer) IS
  'SECURITY DEFINER by design: writes the caller''s own usage row, which RLS does not permit directly. Keys on auth.uid(); linter 0029 is expected.';

COMMENT ON FUNCTION public.queue_claim(uuid) IS
  'SECURITY DEFINER by design: dispatches from a shared queue the caller cannot read. Refuses any ticket not owned by auth.uid(); linter 0029 is expected.';
