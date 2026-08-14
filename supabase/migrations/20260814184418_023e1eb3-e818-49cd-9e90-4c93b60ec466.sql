CREATE OR REPLACE FUNCTION public.can_join_study_room(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_rooms
    WHERE id = _room_id AND is_open = true
  );
$$;

REVOKE ALL ON FUNCTION public.can_join_study_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_join_study_room(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users join rooms as themselves" ON public.study_room_members;
CREATE POLICY "Users join open rooms as themselves"
ON public.study_room_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_join_study_room(room_id)
);

CREATE INDEX IF NOT EXISTS study_room_members_user_joined_idx
  ON public.study_room_members (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS study_room_messages_room_created_idx
  ON public.study_room_messages (room_id, created_at ASC);
CREATE INDEX IF NOT EXISTS chats_user_updated_idx
  ON public.chats (user_id, updated_at DESC)
  WHERE is_incognito = false;