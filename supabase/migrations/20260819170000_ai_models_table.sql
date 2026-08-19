-- Models become data, so they can be added, renamed, reordered and removed
-- from the admin console instead of only in a deploy.
--
-- The three that exist today are seeded with the ids the app already uses,
-- so nothing changes on the first read: chats already stored against
-- 'dap-ai-lite' keep resolving, and the tier gate keeps the same answers.
--
-- sort_order drives the picker: lowest first. It is separate from min_tier
-- on purpose — how capable a model is and where it sits in a list are
-- different questions, and conflating them is what made the previous
-- hardcoded array order load-bearing.
CREATE TABLE IF NOT EXISTS public.ai_models (
  id           text PRIMARY KEY,
  label        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  min_tier     public.account_tier NOT NULL DEFAULT 'free',
  lite         boolean NOT NULL DEFAULT true,
  enabled      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_models IS
  'Selectable DAP AI models. Readable by everyone (the picker needs it); only the service role writes, through the admin console.';
COMMENT ON COLUMN public.ai_models.label IS
  'Display name. This exact string is what the orchestrator routes on.';

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

-- The picker has to render for signed-out visitors too, so reads are open.
-- Writes have no policy at all: they go through the service role only,
-- behind the admin console's own checks. Fail-closed by omission.
DROP POLICY IF EXISTS "Models are publicly readable" ON public.ai_models;
CREATE POLICY "Models are publicly readable"
  ON public.ai_models FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.ai_models TO anon, authenticated;
GRANT ALL    ON public.ai_models TO service_role;

DROP TRIGGER IF EXISTS ai_models_touch ON public.ai_models;
CREATE TRIGGER ai_models_touch
  BEFORE UPDATE ON public.ai_models
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.ai_models (id, label, description, min_tier, lite, enabled, sort_order)
VALUES
  ('dap-ai-lite',     'DAP AI 4 Lite',     'Fast responses and simple answers.',        'free', true,  true, 10),
  ('dap-ai-pro-lite', 'DAP AI 4 Pro Lite', 'Quick like Lite, sharper answers.',         'go',   true,  true, 20),
  ('dap-ai-1.0',      'DAP AI 4 Pro',      'Our most capable and ambitious model yet.', 'pro',  false, true, 30)
ON CONFLICT (id) DO NOTHING;
