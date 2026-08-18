-- Pinned chats: an owner can pin a chat so it survives history pruning.
--
-- Pinned chats are exempt from the delete a prune performs, but they still
-- occupy one of the plan's saved-chat slots — otherwise someone could pin
-- everything and keep an unbounded history. The oldest *unpinned* chat is
-- what actually goes, and only once the pinned ones plus the newest
-- unpinned ones already fill the limit.

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chats.pinned IS
  'Owner-set. Pinned chats are never pruned by prune_own_chats, but still count toward the plan''s saved-chat limit.';

-- Existing "Users CRUD own chats" (FOR ALL) and the GRANT UPDATE on
-- public.chats already let an owner update any column on their own row,
-- pinned included, so no new policy or grant is needed for this column.

CREATE INDEX IF NOT EXISTS chats_user_pinned_updated_idx
  ON public.chats (user_id, pinned DESC, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Re-create prune_own_chats so pinned chats are exempt from deletion but
-- still count toward `_keep`: rank all live chats pinned-first then by
-- recency, and soft-delete only the unpinned ones that fall past the
-- offset in that ranking. A pinned chat can never be the one removed, even
-- if there are more pinned chats than `_keep` — in that case nothing is
-- pruned at all, since there is nothing left to remove without touching a
-- pinned row.
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

  WITH ranked AS (
    SELECT c.id, c.pinned,
           row_number() OVER (ORDER BY c.pinned DESC, c.updated_at DESC) AS rn
      FROM public.chats c
     WHERE c.user_id = uid AND c.deleted_at IS NULL
  )
  UPDATE public.chats
     SET deleted_at = now()
   WHERE id IN (
     SELECT id FROM ranked WHERE rn > _keep AND pinned = false
   );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_own_chats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_own_chats(integer) TO authenticated;
