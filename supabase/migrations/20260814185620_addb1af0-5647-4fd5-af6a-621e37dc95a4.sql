GRANT UPDATE ON public.study_room_members TO authenticated;

DROP POLICY IF EXISTS "Users update their own membership row" ON public.study_room_members;
CREATE POLICY "Users update their own membership row"
ON public.study_room_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS study_room_members_user_room_idx
  ON public.study_room_members (user_id, room_id);
CREATE INDEX IF NOT EXISTS study_room_messages_room_created_idx
  ON public.study_room_messages (room_id, created_at);
CREATE INDEX IF NOT EXISTS chats_user_updated_idx
  ON public.chats (user_id, updated_at DESC);