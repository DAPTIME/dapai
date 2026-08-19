REVOKE EXECUTE ON FUNCTION public.can_join_study_room(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_study_room_by_code(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_join_study_room(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_study_room_by_code(text) TO service_role;