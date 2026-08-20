-- Flashcards are gone from the app: the dialog, the server functions, and
-- the entry point in the chat header. The table goes with them.
--
-- Checked before dropping rather than after: 0 rows, 0 distinct users, no
-- first or last timestamp. Nothing was ever stored here, so this destroys
-- no one's work. Had it held anything, the feature would have come out of
-- the UI and the table would have stayed.
DROP TABLE IF EXISTS public.flashcards;
