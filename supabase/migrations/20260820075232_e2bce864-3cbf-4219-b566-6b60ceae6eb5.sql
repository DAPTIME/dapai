GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_study_room(uuid) TO authenticated;