CREATE TABLE public.email_rate_limit_exempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_rate_limit_exempt TO authenticated;
GRANT ALL ON public.email_rate_limit_exempt TO service_role;

ALTER TABLE public.email_rate_limit_exempt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email rate limit exemptions"
ON public.email_rate_limit_exempt
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX email_rate_limit_exempt_email_idx ON public.email_rate_limit_exempt (lower(email));