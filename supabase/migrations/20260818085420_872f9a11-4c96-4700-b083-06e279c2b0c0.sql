-- 1. Pin search_path on helper functions that lack it
ALTER FUNCTION public.dap_content_hash(text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tier_at_least(public.account_tier, public.account_tier) SET search_path = public, pg_temp;
ALTER FUNCTION public.tier_rank(public.account_tier) SET search_path = public, pg_temp;
ALTER FUNCTION public.track_quota(public.account_tier) SET search_path = public, pg_temp;
ALTER FUNCTION public.usage_day() SET search_path = public, pg_temp;
ALTER FUNCTION public.usage_limit(public.account_tier) SET search_path = public, pg_temp;
ALTER FUNCTION public.usage_week() SET search_path = public, pg_temp;

-- 2. Remove anon EXECUTE on SECURITY DEFINER functions that require a session
REVOKE EXECUTE ON FUNCTION public.my_tier() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_usage(numeric, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_reap() FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_join_study_room(uuid) FROM anon;
-- queue_reap is internal maintenance, invoked only from other definer functions
REVOKE EXECUTE ON FUNCTION public.queue_reap() FROM authenticated;

-- 3. Owners can read their own queue rows
DROP POLICY IF EXISTS "Users read own queue rows" ON public.ai_queue;
CREATE POLICY "Users read own queue rows"
ON public.ai_queue FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 4. Room message authors can edit/delete their own messages; hosts can moderate
DROP POLICY IF EXISTS "Authors update own room messages" ON public.study_room_messages;
CREATE POLICY "Authors update own room messages"
ON public.study_room_messages FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.is_room_member(room_id, auth.uid()))
WITH CHECK (user_id = auth.uid() AND role = 'user');

DROP POLICY IF EXISTS "Authors or hosts delete room messages" ON public.study_room_messages;
CREATE POLICY "Authors or hosts delete room messages"
ON public.study_room_messages FOR DELETE TO authenticated
USING (
  (user_id = auth.uid() AND public.is_room_member(room_id, auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.study_rooms r
    WHERE r.id = study_room_messages.room_id AND r.host_id = auth.uid()
  )
);