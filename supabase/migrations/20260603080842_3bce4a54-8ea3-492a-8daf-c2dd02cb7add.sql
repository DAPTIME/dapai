
CREATE TABLE public.custom_daps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  emoji TEXT NOT NULL DEFAULT '✨' CHECK (char_length(emoji) <= 8),
  system_prompt TEXT NOT NULL CHECK (char_length(system_prompt) BETWEEN 1 AND 4000),
  opener TEXT NOT NULL DEFAULT '' CHECK (char_length(opener) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_daps TO authenticated;
GRANT ALL ON public.custom_daps TO service_role;

ALTER TABLE public.custom_daps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own custom DAPs" ON public.custom_daps
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own custom DAPs" ON public.custom_daps
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own custom DAPs" ON public.custom_daps
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own custom DAPs" ON public.custom_daps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX custom_daps_user_id_idx ON public.custom_daps(user_id, created_at DESC);
