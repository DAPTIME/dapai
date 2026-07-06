
-- 1. Slugify helper (pure, stable)
CREATE OR REPLACE FUNCTION public.slugify_chat_title(_title text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  s := lower(coalesce(_title, ''));
  -- replace anything not alnum with hyphen
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := trim(both '-' from s);
  IF s IS NULL OR s = '' THEN
    s := 'chat';
  END IF;
  IF length(s) > 60 THEN
    s := substring(s from 1 for 60);
    s := trim(both '-' from s);
  END IF;
  RETURN s;
END;
$$;

-- 2. Add slug column
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS slug text;

-- 3. Unique per user + slug (partial so nulls don't collide)
CREATE UNIQUE INDEX IF NOT EXISTS chats_user_slug_uniq
  ON public.chats (user_id, slug)
  WHERE slug IS NOT NULL;

-- 4. Assign a unique slug per (user_id) based on _title, avoiding collisions.
CREATE OR REPLACE FUNCTION public.assign_chat_slug(_user_id uuid, _title text, _self_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 2;
BEGIN
  base := public.slugify_chat_title(_title);
  candidate := base;
  LOOP
    PERFORM 1 FROM public.chats
      WHERE user_id = _user_id
        AND slug = candidate
        AND (_self_id IS NULL OR id <> _self_id);
    IF NOT FOUND THEN
      RETURN candidate;
    END IF;
    candidate := base || '-' || n;
    n := n + 1;
    IF n > 10000 THEN
      RETURN base || '-' || substr(gen_random_uuid()::text, 1, 8);
    END IF;
  END LOOP;
END;
$$;

-- 5. Trigger: on insert or title change, (re)compute slug
CREATE OR REPLACE FUNCTION public.chats_set_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.slug := public.assign_chat_slug(NEW.user_id, NEW.title, NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      NEW.slug := public.assign_chat_slug(NEW.user_id, NEW.title, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chats_set_slug_trg ON public.chats;
CREATE TRIGGER chats_set_slug_trg
BEFORE INSERT OR UPDATE ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.chats_set_slug();

-- 6. Backfill existing rows
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, user_id, title FROM public.chats WHERE slug IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.chats
      SET slug = public.assign_chat_slug(r.user_id, r.title, r.id)
      WHERE id = r.id;
  END LOOP;
END $$;
