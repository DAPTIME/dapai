CREATE TABLE public.beta_testers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.beta_testers TO anon;
GRANT SELECT ON public.beta_testers TO authenticated;
GRANT ALL ON public.beta_testers TO service_role;

ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Beta testers are publicly readable"
  ON public.beta_testers FOR SELECT
  USING (true);

CREATE POLICY "Admins manage beta testers"
  ON public.beta_testers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.beta_testers (name, sort_order) VALUES
  ('Ishaan Jain', 10),
  ('Uzair Khan', 20),
  ('Abhay Dhakan', 30),
  ('Alexander Evershed', 40),
  ('Ibrahim Ali', 50),
  ('Mishika Sharma', 60),
  ('Shanjahanaa Murali', 70);
