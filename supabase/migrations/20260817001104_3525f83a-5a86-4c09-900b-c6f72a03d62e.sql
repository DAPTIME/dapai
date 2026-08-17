DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'study_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_rooms;
  END IF;
END
$$;