-- Keep deleted chats for the admin console, permanently.
--
-- Deleting a chat removed the row and its messages outright, so anything a
-- user cleared was gone from the console too. Deletion is now a flag: the
-- chat leaves the user's history immediately and completely, and the record
-- stays for an admin to read.
--
-- ── Why this is enforced here rather than in the app ────────────────────
--
-- The app writes with the caller's own key under RLS, and `authenticated`
-- held DELETE on both tables. A soft delete implemented only in TypeScript
-- would have been a suggestion: anyone could DELETE straight through
-- PostgREST and the row would be gone regardless. So the grants come off
-- and deletion goes through a function that only ever sets a flag.
--
-- Admins keep a real delete, through the service-role client, which is the
-- one way a chat actually leaves the database.
--
-- ── A conflict this creates, stated rather than buried ──────────────────
--
-- Incognito chats are already stored — the flag only hides them from the
-- user's own sidebar — and this makes them permanent too. The toggle's
-- tooltip says "chats won't be saved", which was already untrue and is now
-- more so. The copy is corrected in the same change; whether incognito
-- should be exempt from admin retention is a product decision, and the
-- honest thing is to surface it rather than let the word do work the code
-- does not.

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.chats.deleted_at IS
  'Set when the owner deletes the chat. The row and its messages are kept indefinitely for the admin console; only an admin can remove them for real.';

-- The console lists newest-first across everything; users read only their
-- own live rows. Two different queries, two partial indexes.
CREATE INDEX IF NOT EXISTS chats_live_idx
  ON public.chats (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chats_deleted_idx
  ON public.chats (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ── Users may no longer delete rows ────────────────────────────────────
REVOKE DELETE ON public.chats FROM authenticated;
REVOKE DELETE ON public.chat_messages FROM authenticated;

DROP POLICY IF EXISTS "Users delete own messages" ON public.chat_messages;

-- Their own live chats only. A chat they deleted should read as gone to
-- them, through the API as well as in the sidebar.
DROP POLICY IF EXISTS "Users read own chats" ON public.chats;
CREATE POLICY "Users read own chats"
  ON public.chats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- ── Deleting, for the owner ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_own_chat(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  UPDATE public.chats
     SET deleted_at = COALESCE(deleted_at, now())
   WHERE id = _id
     AND user_id = auth.uid()
     AND deleted_at IS NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_own_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_chat(uuid) TO authenticated;

-- ── Pruning to the plan's saved-chat limit ─────────────────────────────
-- Same reasoning: falling off the end of the history is a deletion, and the
-- console should still have it. Returns how many were retired so the caller
-- can log it.
CREATE OR REPLACE FUNCTION public.prune_own_chats(_keep integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  n integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;
  IF _keep IS NULL OR _keep < 0 THEN
    RAISE EXCEPTION 'Invalid limit.';
  END IF;

  UPDATE public.chats
     SET deleted_at = now()
   WHERE id IN (
     SELECT c.id FROM public.chats c
      WHERE c.user_id = uid AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC
      OFFSET _keep
   );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_own_chats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_own_chats(integer) TO authenticated;
