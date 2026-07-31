-- Security review follow-up: close read access that was wider than the
-- features needing it, and stop relying on a trigger as the only thing
-- standing between a user and their own privileged columns.


-- ── Avatars ────────────────────────────────────────────────────────────
-- The bucket is private, but the SELECT policy only checked which bucket
-- the object was in — so any signed-in user could read any other user's
-- avatar by path. Uploads already key on the first path segment being the
-- owner's uid; the read now matches, which is what the INSERT, UPDATE and
-- DELETE policies beside it have always done.
DROP POLICY IF EXISTS "Avatar images viewable by authenticated" ON storage.objects;
CREATE POLICY "Users can read their own avatar"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ── Track scores ───────────────────────────────────────────────────────
-- SELECT was USING (true), which handed every signed-in user the whole
-- table: every player's user_id alongside their times. The leaderboard
-- never needed that — get_track_leaderboard() is SECURITY DEFINER and
-- returns display name, time and rank with no user_id at all, so the
-- public board keeps working untouched. Direct reads are now the owner's
-- own row, which is all the client asks for.
DROP POLICY IF EXISTS "Authenticated users can read scores" ON public.track_scores;
CREATE POLICY "User can read own score"
  ON public.track_scores FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ── Profiles ───────────────────────────────────────────────────────────
-- The UPDATE policy allowed a user to write any column of their own row,
-- with prevent_profile_privileged_updates() as the only guard on tier and
-- pro_messages_used. A trigger is a fine belt, but it should not be the
-- only one: drop the table-wide UPDATE grant and hand back column grants
-- for exactly the two fields a user edits as themselves. Postgres then
-- refuses a write to email, tier or pro_messages_used before any trigger
-- runs.
--
-- recovery_question and recovery_answer_hash are deliberately not here.
-- Every write to them goes through supabaseAdmin in recovery.functions.ts,
-- which holds the service role and so is unaffected by these grants —
-- granting them to authenticated would widen the surface for nothing.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, avatar_url) ON public.profiles TO authenticated;


-- ── SECURITY DEFINER execute grants ────────────────────────────────────
-- These run as the definer, so anything holding EXECUTE runs with the
-- function's privileges rather than its own. Postgres grants EXECUTE to
-- PUBLIC on creation, which is how the trigger functions and the role
-- check ended up callable straight off the REST API by anyone with the
-- anon key.
--
-- The three trigger functions are only ever invoked by their triggers,
-- which run as the table owner and do not consult these grants at all.
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_privileged_updates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_privileged_inserts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- has_role() is called inside RLS policies, which evaluate as the calling
-- user, so authenticated must keep EXECUTE. anon has no policy that needs
-- it, and leaving it callable let a signed-out caller probe whether any
-- given uid is an admin.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- The leaderboard is public by design: it is read on the track page before
-- sign-in, and returns no user identifiers. PUBLIC is narrowed to the two
-- roles that actually call it.
REVOKE ALL ON FUNCTION public.get_track_leaderboard(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) TO anon, authenticated;
