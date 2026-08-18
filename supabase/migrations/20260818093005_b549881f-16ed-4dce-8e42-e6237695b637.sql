ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS chats_user_pinned_created_idx
  ON public.chats (user_id, pinned DESC, created_at DESC);