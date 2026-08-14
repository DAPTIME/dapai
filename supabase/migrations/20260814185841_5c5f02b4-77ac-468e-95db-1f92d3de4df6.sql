REVOKE ALL ON FUNCTION public.find_study_room_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_study_room_by_code(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.install_custom_dap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.install_custom_dap(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_room_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_track_leaderboard(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;