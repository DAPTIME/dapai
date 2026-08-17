-- Clear every recorded lap time.
--
-- The car changed. It used to settle at about 53.9 km/h — not the 100 the
-- old constants claimed, because drag balanced the engine two thirds of the
-- way up — and it now genuinely reaches 80, with boost pads that stack to
-- 125. Every time in this table was set on the old car.
--
-- Keeping them would not be a leaderboard, it would be two leaderboards
-- printed on top of each other: nobody on the new physics can be compared
-- with anybody on the old, and the old times are not even uniformly slower
-- once boost chains are involved. A record that cannot be beaten fairly or
-- lost fairly is worse than an empty board.
--
-- This is deliberately destructive and cannot be undone. It is a migration
-- rather than a one-off because the database was unreachable when the
-- physics landed, and the wipe has to happen with the change rather than
-- at some later moment when somebody remembers.
--
-- Personal bests live in the browser's own storage and are not touched
-- here; they are re-earned naturally as people drive.

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.track_scores;
  RAISE NOTICE 'wiping % recorded lap time(s) set on the previous car', n;
END $$;

DELETE FROM public.track_scores;
