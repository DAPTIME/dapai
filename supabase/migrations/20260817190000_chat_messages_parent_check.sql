-- Tie a chat message to the chat it claims to belong to.
--
-- The policies checked only user_id = auth.uid(). Reading was therefore
-- already safe — you see your own rows and nobody else's — but writing was
-- not: nothing stopped an INSERT that set user_id to yourself and chat_id
-- to somebody else's conversation.
--
-- That row is invisible to the victim, whose own SELECT policy filters on
-- their user_id. It is not invisible everywhere. The admin console reads
-- conversations with the service-role client, which RLS does not filter, so
-- a stranger could put text into a thread an admin later reads — and text
-- that arrives in someone else's conversation and is read by a human or
-- fed to a model is worth closing off.
--
-- All three policies get the parent check, not just INSERT. On SELECT and
-- DELETE it changes nothing today, because a row with your user_id and
-- another chat's id should not exist once INSERT is fixed. It is written in
-- anyway so the invariant is stated in one place rather than depending on
-- the absence of rows an earlier version allowed.

DROP POLICY IF EXISTS "Users read own messages" ON public.chat_messages;
CREATE POLICY "Users read own messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chats c
       WHERE c.id = chat_messages.chat_id
         AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own messages" ON public.chat_messages;
CREATE POLICY "Users insert own messages"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chats c
       WHERE c.id = chat_messages.chat_id
         AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users delete own messages" ON public.chat_messages;
CREATE POLICY "Users delete own messages"
  ON public.chat_messages FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chats c
       WHERE c.id = chat_messages.chat_id
         AND c.user_id = auth.uid()
    )
  );

-- The subquery runs per row, so it needs the parent lookup to be an index
-- hit. chats.id is the primary key, so it already is.

-- Anything already in the table that breaks the invariant. Reported rather
-- than deleted: on a healthy database this is zero, and quietly removing
-- someone's messages to satisfy a new policy is not a migration's decision
-- to make.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM public.chat_messages m
    LEFT JOIN public.chats c ON c.id = m.chat_id
   WHERE c.id IS NULL OR c.user_id <> m.user_id;

  IF n > 0 THEN
    RAISE WARNING 'chat_messages: % row(s) do not match their parent chat''s owner. They are now unreadable through the API; review before deleting.', n;
  END IF;
END $$;
