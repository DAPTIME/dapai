CREATE TABLE public.email_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  kind text NOT NULL DEFAULT 'email',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_rate_limits_ip_created_idx ON public.email_rate_limits (ip, created_at DESC);
GRANT ALL ON public.email_rate_limits TO service_role;
ALTER TABLE public.email_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.password_reset_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL,
  ip text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_sessions_token_idx ON public.password_reset_sessions (token_hash);
GRANT ALL ON public.password_reset_sessions TO service_role;
ALTER TABLE public.password_reset_sessions ENABLE ROW LEVEL SECURITY;