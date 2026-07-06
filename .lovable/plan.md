
# Human-readable chat URLs

Today every chat lives at `/c/<uuid>` — safe, but ugly and not shareable in a meaningful way. This plan makes each chat's URL match its name, scoped per account, with numeric suffixes for duplicates (e.g. `work`, `work-2`, `work-3`).

## What changes for you

- A chat titled "Work" for your account opens at `/c/work`.
- Create a second chat also titled "Work" → it opens at `/c/work-2`.
- Another account can also have `/c/work` — it points to their own chat, never yours.
- Renaming a chat updates the URL. Old UUID links still work (they redirect to the current slug).

## Technical outline

1. **DB migration** — add `slug text` to `public.chats`, unique per `(user_id, slug)`. Backfill existing rows from their title (or first message), disambiguating collisions with `-2`, `-3`, etc. Add an update trigger so a title change regenerates the slug (only if the user hasn't manually set one).
2. **Slug helper** — small pure function `toSlug(title)` (lowercase, strip punctuation, spaces → `-`, trim to ~60 chars, fallback to `chat`). Duplicate resolution runs server-side inside a transaction.
3. **Server functions** (`src/lib/chats.functions.ts`)
   - `createChat` returns `{ id, slug }`; the mutation now assigns and returns the slug.
   - New `getChatBySlug({ slug })` — RLS already scopes to the caller.
   - `getChat` keeps working by UUID (used as fallback for old links).
4. **Route rename** — replace `src/routes/c.$threadId.tsx` with `src/routes/c.$slug.tsx`. Loader tries slug first; if it looks like a UUID and no slug matches, falls back to `getChat` and then redirects to the canonical slug URL.
5. **All navigation call sites** — sidebar, "new chat", post-send navigation, share buttons, etc. switch from `params={{ threadId }}` to `params={{ slug }}`. The chat object already carries both fields, so components just read `chat.slug`.
6. **Sitemap / SEO** — chats are `noindex` so no sitemap change needed.

## Out of scope

- Custom user-editable slugs (could add a "rename URL" field later).
- Changing the `/c/` prefix or dropping it entirely.
- Username prefixes like `/devansh/work` — the RLS scoping already makes URLs account-private.

Approve and I'll ship it in one pass (migration first, then the code changes once the migration is applied).
