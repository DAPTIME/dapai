ALTER TYPE public.account_tier ADD VALUE IF NOT EXISTS 'go';
ALTER TYPE public.account_tier ADD VALUE IF NOT EXISTS 'exclusive';

CREATE TABLE IF NOT EXISTS public.usage_quota (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  day_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  day_tokens numeric NOT NULL DEFAULT 0,
  day_images integer NOT NULL DEFAULT 0,
  week_start date NOT NULL DEFAULT date_trunc('week', (now() AT TIME ZONE 'utc'))::date,
  week_tokens numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.usage_quota TO authenticated;
GRANT ALL ON public.usage_quota TO service_role;

ALTER TABLE public.usage_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage" ON public.usage_quota
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER usage_quota_touch
  BEFORE UPDATE ON public.usage_quota
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();