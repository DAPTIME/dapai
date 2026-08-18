-- Refund a usage charge for a request that produced nothing.
CREATE OR REPLACE FUNCTION public.refund_usage(_cost numeric, _images integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 100 THEN RAISE EXCEPTION 'Invalid refund.'; END IF;
  IF _images IS NULL OR _images < 0 OR _images > 1 THEN RAISE EXCEPTION 'Invalid refund.'; END IF;

  UPDATE public.usage_quota
     SET day_tokens = GREATEST(0, day_tokens - CASE WHEN day_date = public.usage_day() THEN _cost ELSE 0 END),
         day_images = GREATEST(0, day_images - CASE WHEN day_date = public.usage_day() THEN _images ELSE 0 END),
         week_tokens = GREATEST(0, week_tokens - CASE WHEN week_started_at = public.usage_week() THEN _cost ELSE 0 END),
         updated_at = now()
   WHERE user_id = uid;
END;
$$;

-- Delete one of your own chats (messages cascade / are removed with it).
CREATE OR REPLACE FUNCTION public.delete_own_chat(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  DELETE FROM public.chat_messages WHERE chat_id = _id AND user_id = uid;
  DELETE FROM public.chats WHERE id = _id AND user_id = uid;
  RETURN FOUND;
END;
$$;

-- Trim your own history down to _keep most recently updated chats.
CREATE OR REPLACE FUNCTION public.prune_own_chats(_keep integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
  doomed uuid[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF _keep IS NULL OR _keep < 0 THEN RAISE EXCEPTION 'Invalid keep count.'; END IF;

  SELECT COALESCE(array_agg(c.id), '{}') INTO doomed
    FROM (
      SELECT id FROM public.chats
       WHERE user_id = uid
       ORDER BY updated_at DESC
      OFFSET _keep
    ) c;

  IF array_length(doomed, 1) IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.chat_messages WHERE chat_id = ANY(doomed) AND user_id = uid;
  DELETE FROM public.chats WHERE id = ANY(doomed) AND user_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_usage(numeric, integer) FROM anon;
REVOKE ALL ON FUNCTION public.delete_own_chat(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.prune_own_chats(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.refund_usage(numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prune_own_chats(integer) TO authenticated;

-- Admin "AI Enabled" switch, on by default.
INSERT INTO public.ai_settings (id, system_prompt, updated_at)
VALUES ('feature_ai_enabled', 'on', now())
ON CONFLICT (id) DO NOTHING;