# Roles and tiers

Two separate systems, often confused because both look like "levels".

| | Where it lives | What it controls | How to change it |
| --- | --- | --- | --- |
| **Admin** | `profiles.site_admin` (boolean) | Access to `/admin`: users, system prompt, every chat, feature flags | Tick the checkbox in the Table Editor |
| **Tier** | `profiles.tier` (`free` / `go` / `pro` / `exclusive`) | Which models an account can use, token quota, chat memory | Admin console → **Users** → ⋯ → **Change plan**, or the Table Editor |

Admin is not a tier. Making someone `pro` gives them a bigger plan; it does not
let them into the console. Ticking `site_admin` opens the console; it does not
change their quota.

## Making someone an admin

**Table Editor → `profiles` → the `site_admin` column.** It is `false` for
everyone. Tick it for the accounts you want. That is the whole procedure — the
site reads that column and nothing else.

`public.user_roles` still exists and still holds `admin` rows, because RLS
policies across the schema call `has_role(auth.uid(), 'admin')`. A trigger
mirrors the checkbox into it, one-way. **Do not edit `user_roles` by hand** —
the next write to `site_admin` will overwrite whatever you put there. Two
tables that write to each other eventually disagree, and then nobody can say
which one is right.

Nobody can tick it for themselves: `authenticated` holds `UPDATE` on only
`(name, avatar_url)` of `profiles`, so `site_admin` is unreachable over the
API, and `prevent_profile_privileged_updates()` rejects it as a second layer.

## The combined view

There is also an `admin` schema with one editable view, `admin.users`, that
puts accounts, plans and admin in one place.

**Table Editor → schema dropdown (top left, usually says `public`) → `admin`
→ `users`.** One row per account, with `email`, `name`, `tier`, `is_admin`,
`roles`, `email_confirmed`, `last_sign_in_at`.

Edit a cell and it saves:

- **`tier`** — pick `free`, `go`, `pro` or `exclusive`. Writes to `profiles.tier`.
- **`is_admin`** — tick or untick. Writes `profiles.site_admin`.
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

## Signup bootstrap

`public.handle_new_user()` ticks `site_admin` for one address —
`pancholiadevansh@gmail.com` — and only when no admin exists yet. That is
purely so a rebuilt database has someone who can open the console; once any
admin exists the branch can never fire again. If you ever change your email,
change it there too.

## The underlying tables, if you prefer

```sql
-- make an admin (this is all the checkbox does)
update public.profiles set site_admin = true
where lower(email) = lower('person@example.com');

-- set a plan
update public.profiles
set tier = 'pro'::public.account_tier   -- free | go | pro | exclusive
where lower(email) = lower('person@example.com');
```

Both bypass the last-admin guard, which lives in `admin.set_admin` and the
view's trigger rather than on the table. Untick the last admin this way and
the console is shut until you set the column back.

Do **not** insert or delete `public.user_roles` rows by hand. The trigger on
`profiles.site_admin` owns that table's `admin` rows and will overwrite you.

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

A role other than `admin` is yours to manage in `user_roles` directly — the
sync trigger only touches `admin` rows. `admin.users` shows it in the `roles`
column immediately. At that point the role exists and grants **nothing**.
Permissions are not derived from the name — every gate is written explicitly,
in one of two places:

- **In the app**, `isAdminUser` / `assertAdmin` in `src/lib/admin.server.ts`
  read `profiles.site_admin` specifically. A manager level would need its own
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
