# Poly Racer: editor, sharing, browse, leaderboards

## What you'll get

- A **Level Editor** at `/games/polytrack/editor` with live preview. You tweak the road, save drafts to your account, and publish qualifying levels publicly.
- **Sharable links** like `/games/polytrack/track/<id>` that anyone can open and play.
- A **User Tracks** browser at `/games/polytrack/browse` listing published community tracks, sorted by newest and most-played.
- **Leaderboards** on every track (built-in and user-made) with top times and player names.
- Progress and scores saved per-account in the database (with an anon fallback for the built-in tracks only).

## Data model (new tables)

- `custom_tracks` — one row per track a user builds.
  - `owner_id`, `name`, `season` (spring/summer/fall/winter), `params` (jsonb: amp1, freq1, amp2, freq2, half, phase), `goal`, `is_public`, timestamps.
- `track_scores` — best time per player per track.
  - `user_id`, `track_ref` (`builtin:1..20` or `custom:<uuid>`), `best_time_ms`, timestamps.
  - Unique on `(user_id, track_ref)`; only upsert when the new time is lower.

RLS:
- `custom_tracks`: owner can read/write anything they own; anyone signed in can read `is_public = true`.
- `track_scores`: any signed-in user can read (needed for leaderboard); insert/update only their own row.

A `get_track_leaderboard(track_ref, limit)` SQL function joins scores → profiles and returns `{ name, best_time_ms, rank }` so the client doesn't need broad access to profiles.

## Editor

Controls (sliders + inputs):
- Season, name, road width (`half`), curve amplitude/frequency ×2, phase, goal length.
- Live canvas preview of the same renderer the game uses.
- Save Draft / Update / Delete / Publish buttons.

Publish criteria (enforced server-side, mirrored client-side for instant feedback):
- Name: 3–40 chars, letters/numbers/space/`- _ ' .`; blocked against a profanity wordlist; no repeated character runs > 4.
- Goal: 400–3000.
- Road width `half`: 55–110.
- `amp1 + amp2` ≤ `(W/2 − half − 20)` so the track never leaves the canvas (this is exactly what makes the level "possible").

If any check fails, publishing returns a clear error and the track stays private.

## Play + timer

- Refactor the game so it accepts either a built-in level or a custom track (same physics, same renderer).
- Start a millisecond timer on the first movement; stop it on the finish line.
- On win, submit `best_time_ms` via a server fn; leaderboard refreshes.

## Sharing

- Track detail route: `/games/polytrack/track/$id` → play + leaderboard + owner name + "Open in editor" (owner only) + Copy Link button.
- Owners of a private track can share the link with themselves and playtest before publishing.

## Files touched

New:
- Migration: `custom_tracks`, `track_scores`, RLS + grants, `get_track_leaderboard` function.
- `src/lib/tracks.functions.ts` — server fns: list mine, list public, get by id, create, update, delete, publish/unpublish, submit_score, get_leaderboard.
- `src/lib/track-validation.ts` — shared validate + profanity list (used by client + server fn).
- `src/routes/games.polytrack.editor.tsx` — editor (new + edit via `?id=` search param).
- `src/routes/games.polytrack.browse.tsx` — public tracks browser.
- `src/routes/games.polytrack.track.$id.tsx` — play + leaderboard for one custom track.

Modified:
- `src/routes/games.polytrack.tsx` — shared renderer/params extracted; timer; server-fn score submit; per-account unlocks now saved server-side with localStorage fallback.
- `src/routes/games.tsx` — sidebar links to Editor and Browse.
- `src/routes/games.index.tsx` — mention the new sections.

## Notes for you

- Anonymous visitors can play built-in tracks and see leaderboards but can't save scores, save drafts, or publish. The editor page prompts them to sign in.
- The profanity list is a starter list; you can extend it later without a migration.
- Deleting a track deletes its scores (foreign key cascade).
