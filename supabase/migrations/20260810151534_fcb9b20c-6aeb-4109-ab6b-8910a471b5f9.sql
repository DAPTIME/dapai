-- 1) chat_messages: require ownership of the parent chat, not just the row's user_id
DROP POLICY IF EXISTS "Users insert own messages" ON public.chat_messages;
CREATE POLICY "Users insert own messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = chat_messages.chat_id AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users update own messages" ON public.chat_messages;
CREATE POLICY "Users update own messages"
ON public.chat_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = chat_messages.chat_id AND c.user_id = auth.uid()
  )
);

-- 2) SECURITY DEFINER functions that are trigger-only or internal must not be
--    callable through the Data API by anon/authenticated.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_privileged_inserts() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_privileged_updates() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated;

-- has_role is required by RLS policies for signed-in users; anon never needs it.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Public leaderboards are read by guests by design; keep it callable but pinned.
GRANT EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) TO anon, authenticated;