-- Finish the parent-chat invariant on chat_messages.
--
-- 20260817190000 gave SELECT and INSERT an EXISTS check tying the row to a
-- chat the caller owns. The UPDATE policy already carried that check in its
-- WITH CHECK half, but its USING half tested only user_id.
--
-- USING chooses which existing rows may be targeted; WITH CHECK judges the
-- result. So the gap was narrow: a caller could target a row of their own
-- that was parented to somebody else's chat, and move it into their own.
-- Reaching it needs such a row to exist, and the audit query returned zero,
-- so this closes a shape rather than an active hole. It is written down
-- because "no row currently breaks the rule" is not the same guarantee as
-- "the rule is enforced", and all three policies should say the same thing.
DROP POLICY IF EXISTS "Users update own messages" ON public.chat_messages;
CREATE POLICY "Users update own messages"
  ON public.chat_messages FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chats c
       WHERE c.id = chat_messages.chat_id
         AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chats c
       WHERE c.id = chat_messages.chat_id
         AND c.user_id = auth.uid()
    )
  );
