CREATE TABLE public.user_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_memories TO authenticated;
GRANT ALL ON public.user_memories TO service_role;

ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own memories"
  ON public.user_memories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own memories"
  ON public.user_memories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own memories"
  ON public.user_memories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own memories"
  ON public.user_memories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_memories_user ON public.user_memories(user_id, created_at DESC);