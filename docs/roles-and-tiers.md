# Roles and tiers

Two separate systems, often confused because both look like "levels".

| | Where it lives | What it controls | How to change it |
| --- | --- | --- | --- |
| **Role** | `public.user_roles` (`admin` / `user`) | Access to `/admin`: users, system prompt, every chat, feature flags | SQL (below) |
| **Tier** | `profiles.tier` (`free` / `go` / `pro` / `exclusive`) | Which models an account can use, token quota, chat memory | Admin console → **Users** → ⋯ → **Change plan**, or SQL |

A role is not a tier. Making someone `pro` gives them a bigger plan; it does not
let them into the console. Making someone `admin` opens the console; it does not
change their quota.

## Doing it from the Supabase dashboard

There is an `admin` schema with one editable view, `admin.users`, that puts
both in one place — no joins, no SQL.

**Table Editor → schema dropdown (top left, usually says `public`) → `admin`
→ `users`.** One row per account, with `email`, `name`, `tier`, `is_admin`,
`roles`, `email_confirmed`, `last_sign_in_at`.

Edit a cell and it saves:

- **`tier`** — pick `free`, `go`, `pro` or `exclusive`. Writes to `profiles.tier`.
- **`is_admin`** — tick or untick. Writes a row into or out of `public.user_roles`.
- **`name`** — writes to `profiles.name`.

`email`, `roles` and the timestamps are read-only. Changing an email is refused
on purpose: it lives in `auth.users` *and* `profiles.email`, and the app reads
the second one, so they must be changed together — do it under
**Authentication → Users**.

Removing the **last** admin is also refused. There would be nobody left who
could open the console or hand the role back out.

### The same thing in the SQL Editor

```sql
select admin.set_admin('person@example.com');          -- make them an admin
select admin.set_admin('person@example.com', false);   -- take it away
select admin.set_tier('person@example.com', 'pro');    -- free | go | pro | exclusive
```

```sql
-- who has what
select email, tier, is_admin, roles, last_sign_in_at
from admin.users order by is_admin desc, created_at;
```

Both functions raise a plain-English error if the address has never signed up
— there is no user to grant anything to until then.

### Why it isn't in the `public` schema

Because `admin.users` shows every user's email address. PostgREST only serves
the `public` and `graphql_public` schemas, so nothing in `admin` is reachable
over the API at any URL, and on top of that `anon` and `authenticated` are
granted nothing on it. Only the dashboard (`postgres`) and the server's
service-role key can read or write it. **If you ever move these into `public`,
you publish your whole user list.**

## The underlying tables, if you prefer

```sql
-- grant admin
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('person@example.com')
on conflict (user_id, role) do nothing;

-- revoke admin
delete from public.user_roles
where role = 'admin'
  and user_id in (select id from auth.users where lower(email) = lower('person@example.com'));

-- set a plan
update public.profiles
set tier = 'pro'::public.account_tier   -- free | go | pro | exclusive
where lower(email) = lower('person@example.com');
```

`auth.users` rather than `public.profiles` on purpose: the profile row is
created by a trigger and can be missing, but the auth row always exists for
anyone who has signed up.

These bypass the last-admin guard, because the guard lives in `admin.set_admin`
and the view's trigger. Going around it is your own risk.

Plans can also be changed without touching the database at all: admin console →
**Users** tab → ⋯ on the row → **Change plan**.

## Adding a new role, e.g. "manager"

Two steps, and the first one alone does nothing:

```sql
-- 1. Teach the enum the new value. Cannot run inside a transaction block.
alter type public.app_role add value if not exists 'manager';
```

```sql
-- 2. Grant it to someone.
insert into public.user_roles (user_id, role)
select id, 'manager'::public.app_role
from auth.users where lower(email) = lower('person@example.com')
on conflict (user_id, role) do nothing;
```

`admin.users` shows it in the `roles` column immediately. At that point the role
exists and grants **nothing**. Permissions are not derived from the name —
every gate is written explicitly, in one of two places:

- **In the app**, `isAdminUser` / `assertAdmin` in `src/lib/admin.server.ts`
  check for the `admin` row specifically. A manager tier would need its own
  check, and every server function it should reach would need to call it.
- **In the database**, RLS policies call `public.has_role(auth.uid(), 'admin')`.
  A policy that should also admit managers has to say so.

So "add a manager who can read chats but not delete users" is a code change,
not just a row. The enum value is the cheap part.

One ordering trap if you ever compare roles or tiers in SQL: Postgres orders an
enum by **declaration order**, and values added later sort last regardless of
meaning. `go` and `exclusive` were added to `account_tier` after `pro`, so
`'go' > 'pro'` is true in SQL. `src/lib/tier-rank.ts` exists because of this —
it ranks tiers explicitly, and the downgrade endpoint uses it rather than the
enum's own ordering.
