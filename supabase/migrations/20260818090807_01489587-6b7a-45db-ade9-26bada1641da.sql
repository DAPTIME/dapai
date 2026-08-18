-- 1. Membership rows: only the display name may change.
CREATE OR REPLACE FUNCTION public.lock_study_room_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.room_id IS DISTINCT FROM OLD.room_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership rows cannot be moved between rooms or users.';
  END IF;
  NEW.joined_at := OLD.joined_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_room_members_lock ON public.study_room_members;
CREATE TRIGGER study_room_members_lock
  BEFORE UPDATE ON public.study_room_members
  FOR EACH ROW EXECUTE FUNCTION public.lock_study_room_membership();

REVOKE EXECUTE ON FUNCTION public.lock_study_room_membership() FROM PUBLIC, anon, authenticated;

-- 2. Internal helpers: no API-role EXECUTE. The app calls these only from
--    inside other functions, policies, or as service_role.
REVOKE EXECUTE ON FUNCTION public.get_track_leaderboard(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_tier() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_join_study_room(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_study_rooms() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_study_room(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_restore_study_room(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_position(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_reap() FROM PUBLIC, anon, authenticated;

-- 3. The RPCs the app really calls stay available to signed-in users only.
GRANT EXECUTE ON FUNCTION
  public.charge_usage(numeric, integer),
  public.refund_usage(numeric, integer),
  public.my_usage(),
  public.delete_own_chat(uuid),
  public.prune_own_chats(integer),
  public.queue_join(uuid),
  public.queue_claim(uuid),
  public.queue_status(uuid),
  public.queue_beat(uuid),
  public.queue_release(uuid, boolean),
  public.queue_eta_seconds(),
  public.create_custom_dap(text, text, text, text, text),
  public.submit_custom_dap(uuid),
  public.unpublish_custom_dap(uuid),
  public.delete_custom_dap(uuid),
  public.install_custom_dap(uuid),
  public.marketplace_daps(),
  public.my_dap_notices(),
  public.mark_dap_notices_seen(),
  public.admin_list_dap_submissions(),
  public.admin_review_dap(uuid, boolean, text),
  public.find_study_room_by_code(text),
  public.set_track_published(uuid, boolean),
  public.verify_own_track(uuid, integer)
TO authenticated;