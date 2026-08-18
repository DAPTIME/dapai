-- Remove the beta testers feature and the Our Team page it lived on.
--
-- The page carried three sections: Website Creator, AI Designer and Beta
-- Testers. All of it goes, along with the /team route, the sidebar entry,
-- the admin console's Beta Testers tab and the "Our Team page" feature
-- toggle. Nothing else read this table.
--
-- This destroys the 7 names that were listed. It is deliberate and cannot
-- be undone from here; the names are not copied into this file, because
-- reproducing personal data in version control is the opposite of removing
-- it. Restoring the feature would mean re-entering them.
DO $$
DECLARE
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'beta_testers') THEN
    SELECT count(*) INTO n FROM public.beta_testers;
    RAISE NOTICE 'dropping beta_testers with % row(s)', n;
  END IF;
END $$;

DROP TABLE IF EXISTS public.beta_testers;

-- Feature flags are rows in ai_settings keyed feature_<key>. With "team"
-- gone from FEATURE_KEYS the row is never read again, so it would sit there
-- as a toggle for a page that no longer exists.
DELETE FROM public.ai_settings WHERE id = 'feature_team';
