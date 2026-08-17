-- Custom DAPs: moderation, quotas, and who may do what.
--
-- A published DAP is a system prompt that runs on the owner's own Orin
-- hardware in front of other people's conversations, so publishing is a
-- request rather than an action. Every rule below is enforced here rather
-- than in TypeScript, because the app writes with the caller's own key
-- under RLS: a limit checked only in the browser is a suggestion.
--
--   create / publish : Pro and up
--   use a published one : Go and up
--   approve : site_admin
--
-- ── Why a content hash ──────────────────────────────────────────────────
--
-- "You cannot press publish again until it is rejected, or until you change
-- something" needs a definition of "change". The hash of the three fields
-- that moderation actually judges — name, emoji, system prompt — is that
-- definition. Editing the description or the opener does not buy another
-- review slot, because neither is what was reviewed.

ALTER TABLE public.custom_daps
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS notice_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'custom_daps_moderation_status_check'
  ) THEN
    ALTER TABLE public.custom_daps
      ADD CONSTRAINT custom_daps_moderation_status_check
      CHECK (moderation_status IN ('draft', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

COMMENT ON COLUMN public.custom_daps.reviewed_hash IS
  'Hash of the name/emoji/system prompt as last submitted. A DAP may be resubmitted only when its current content hashes differently, or when it was rejected.';

CREATE INDEX IF NOT EXISTS custom_daps_pending_idx
  ON public.custom_daps (submitted_at)
  WHERE moderation_status = 'pending';

-- ── What moderation judges ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dap_content_hash(_name text, _emoji text, _prompt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(coalesce(_name,'') || E'\x1f' || coalesce(_emoji,'') || E'\x1f' || coalesce(_prompt,''))
$$;

-- ── Tier helper ─────────────────────────────────────────────────────────
-- Ranked explicitly: the account_tier enum orders by declaration, and 'go'
-- was added after 'pro', so comparing the enum would put Go above Pro.
CREATE OR REPLACE FUNCTION public.tier_at_least(_tier public.account_tier, _min public.account_tier)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE _tier WHEN 'free' THEN 0 WHEN 'go' THEN 1 WHEN 'pro' THEN 2 WHEN 'exclusive' THEN 3 ELSE 0 END)
       >= (CASE _min  WHEN 'free' THEN 0 WHEN 'go' THEN 1 WHEN 'pro' THEN 2 WHEN 'exclusive' THEN 3 ELSE 0 END)
$$;

CREATE OR REPLACE FUNCTION public.my_tier()
RETURNS public.account_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT p.tier FROM public.profiles p WHERE p.id = auth.uid()), 'free')
$$;

-- ── Creating ────────────────────────────────────────────────────────────
--
-- Three a day, six in total. Past six the oldest is dropped rather than the
-- create being refused: the cap is meant to bound storage, not to make
-- someone go and tidy up before they can try an idea.
--
-- The one-minute cooldown is the anti-spam rule. It counts creates, not
-- edits, so someone iterating on a prompt is never held up by it.
CREATE OR REPLACE FUNCTION public.create_custom_dap(
  _name text, _description text, _emoji text, _system_prompt text, _opener text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_id uuid;
  v_recent integer;
  v_today integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF NOT public.tier_at_least(public.my_tier(), 'pro') THEN
    RAISE EXCEPTION 'Creating a Custom DAP needs the DAP AI 4 Pro plan.';
  END IF;
  IF coalesce(trim(_name), '') = '' OR coalesce(trim(_system_prompt), '') = '' THEN
    RAISE EXCEPTION 'A Custom DAP needs a name and instructions.';
  END IF;
  IF length(_system_prompt) > 4000 THEN
    RAISE EXCEPTION 'Those instructions are too long.';
  END IF;

  SELECT count(*) INTO v_recent FROM public.custom_daps d
   WHERE d.user_id = uid AND d.created_at > now() - interval '1 minute';
  IF v_recent >= 1 THEN
    RAISE EXCEPTION 'You are creating these very quickly. Wait a minute and try again.';
  END IF;

  SELECT count(*) INTO v_today FROM public.custom_daps d
   WHERE d.user_id = uid AND d.created_at >= public.usage_day();
  IF v_today >= 3 THEN
    RAISE EXCEPTION 'You have created 3 Custom DAPs today. You can make more tomorrow.';
  END IF;

  INSERT INTO public.custom_daps (user_id, name, description, emoji, system_prompt, opener)
  VALUES (uid, trim(_name), coalesce(_description, ''), coalesce(nullif(trim(_emoji), ''), '✨'),
          _system_prompt, coalesce(_opener, ''))
  RETURNING id INTO v_id;

  -- Six per account. Never drop a published one to make room for a draft:
  -- other people may be using it.
  DELETE FROM public.custom_daps d
   WHERE d.id IN (
     SELECT x.id FROM public.custom_daps x
      WHERE x.user_id = uid AND x.published IS NOT TRUE
      ORDER BY x.created_at DESC
      OFFSET 6
   );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_custom_dap(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_custom_dap(text, text, text, text, text) TO authenticated;

-- ── Submitting for review ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_custom_dap(_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  d public.custom_daps%ROWTYPE;
  v_hash text;
  v_today integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF NOT public.tier_at_least(public.my_tier(), 'pro') THEN
    RAISE EXCEPTION 'Publishing a Custom DAP needs the DAP AI 4 Pro plan.';
  END IF;

  SELECT * INTO d FROM public.custom_daps WHERE id = _id AND user_id = uid FOR UPDATE;
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'That Custom DAP does not exist.';
  END IF;

  v_hash := public.dap_content_hash(d.name, d.emoji, d.system_prompt);

  IF d.moderation_status = 'pending' THEN
    RAISE EXCEPTION 'That one is already waiting for review. Change it if you want to send a new version.';
  END IF;

  -- Approved and unchanged: nothing to review. Approved and edited: it has
  -- to go round again, because what is live would no longer be what was
  -- judged.
  IF d.moderation_status = 'approved' AND d.reviewed_hash = v_hash THEN
    RAISE EXCEPTION 'That version is already approved.';
  END IF;

  SELECT count(*) INTO v_today FROM public.custom_daps x
   WHERE x.user_id = uid AND x.submitted_at >= public.usage_day();
  IF v_today >= 1 THEN
    RAISE EXCEPTION 'You can submit one Custom DAP for review a day. Try again tomorrow.';
  END IF;

  UPDATE public.custom_daps
     SET moderation_status = 'pending',
         submitted_at = now(),
         reviewed_hash = v_hash,
         reviewed_at = NULL,
         reviewed_by = NULL,
         rejection_reason = NULL,
         notice_seen_at = NULL,
         -- Editing an approved DAP takes it off the marketplace until the
         -- new version is judged, rather than leaving an unreviewed prompt
         -- serving other people.
         published = false
   WHERE id = _id;

  RETURN 'pending';
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_custom_dap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_custom_dap(uuid) TO authenticated;

-- ── Unpublishing and deleting ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unpublish_custom_dap(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.custom_daps
     SET published = false
   WHERE id = _id AND user_id = auth.uid();
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.unpublish_custom_dap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpublish_custom_dap(uuid) TO authenticated;

-- Deleting is refused while published. Someone else may have it installed,
-- and pulling it out from under them without an explicit unpublish first is
-- a decision the owner should have to make on purpose.
CREATE OR REPLACE FUNCTION public.delete_custom_dap(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d public.custom_daps%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.custom_daps WHERE id = _id AND user_id = auth.uid();
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'That Custom DAP does not exist.';
  END IF;
  IF d.published IS TRUE THEN
    RAISE EXCEPTION 'Unpublish it first, then you can delete it.';
  END IF;

  DELETE FROM public.custom_daps WHERE id = _id AND user_id = auth.uid();
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_custom_dap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_custom_dap(uuid) TO authenticated;

-- ── The moderator's queue ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_dap_submissions()
RETURNS TABLE (
  id uuid, name text, emoji text, description text, system_prompt text,
  author_name text, author_email text, submitted_at timestamptz,
  moderation_status text, rejection_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT p.site_admin FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  RETURN QUERY
  SELECT d.id, d.name, d.emoji, d.description, d.system_prompt,
         COALESCE(NULLIF(TRIM(p.name), ''), 'Unknown'), p.email,
         d.submitted_at, d.moderation_status, d.rejection_reason
    FROM public.custom_daps d
    LEFT JOIN public.profiles p ON p.id = d.user_id
   WHERE d.moderation_status IN ('pending', 'rejected')
   ORDER BY (d.moderation_status = 'pending') DESC, d.submitted_at DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_dap_submissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_dap_submissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_dap(_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT p.site_admin FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  UPDATE public.custom_daps
     SET moderation_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         rejection_reason = CASE WHEN _approve THEN NULL ELSE NULLIF(TRIM(COALESCE(_reason, '')), '') END,
         -- Approval is what puts it on the marketplace. A rejection leaves
         -- it private, which is where it already was.
         published = _approve,
         notice_seen_at = NULL
   WHERE id = _id AND moderation_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That submission is no longer pending.';
  END IF;
  RETURN CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_review_dap(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_dap(uuid, boolean, text) TO authenticated;

-- ── Telling the author ──────────────────────────────────────────────────
-- Decisions the author has not been shown yet. Read once, then marked seen,
-- so a rejection is delivered exactly one time rather than nagging.
CREATE OR REPLACE FUNCTION public.my_dap_notices()
RETURNS TABLE (id uuid, name text, emoji text, moderation_status text, rejection_reason text, reviewed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  RETURN QUERY
  SELECT d.id, d.name, d.emoji, d.moderation_status, d.rejection_reason, d.reviewed_at
    FROM public.custom_daps d
   WHERE d.user_id = auth.uid()
     AND d.moderation_status IN ('approved', 'rejected')
     AND d.reviewed_at IS NOT NULL
     AND d.notice_seen_at IS NULL
   ORDER BY d.reviewed_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.my_dap_notices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_dap_notices() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_dap_notices_seen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  UPDATE public.custom_daps
     SET notice_seen_at = now()
   WHERE user_id = auth.uid() AND reviewed_at IS NOT NULL AND notice_seen_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_dap_notices_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_dap_notices_seen() TO authenticated;

-- ── The marketplace ─────────────────────────────────────────────────────
-- Only approved-and-published rows, and only for Go and up. Anything that
-- was published before moderation existed is grandfathered as approved
-- rather than vanishing from other people's accounts without warning.
UPDATE public.custom_daps
   SET moderation_status = 'approved',
       reviewed_at = COALESCE(reviewed_at, now()),
       notice_seen_at = COALESCE(notice_seen_at, now()),
       reviewed_hash = COALESCE(reviewed_hash, public.dap_content_hash(name, emoji, system_prompt))
 WHERE published IS TRUE AND moderation_status = 'draft';

CREATE OR REPLACE FUNCTION public.marketplace_daps()
RETURNS TABLE (
  id uuid, name text, description text, emoji text,
  author_name text, install_count integer, mcp_url text,
  user_id uuid, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.tier_at_least(public.my_tier(), 'go') THEN
    RAISE EXCEPTION 'Custom DAPs are available from DAP AI 4 Pro Lite upwards.';
  END IF;

  RETURN QUERY
  SELECT d.id, d.name, d.description, d.emoji, d.author_name, d.install_count,
         d.mcp_url, d.user_id, d.created_at
    FROM public.custom_daps d
   WHERE d.published IS TRUE
     AND d.moderation_status = 'approved'
   ORDER BY d.install_count DESC NULLS LAST
   LIMIT 60;
END;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_daps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketplace_daps() TO authenticated;
