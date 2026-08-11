# Roles and tiers

Two separate systems, often confused because both look like "levels".

| | Where it lives | What it controls | How to change it |
| --- | --- | --- | --- |
| **Role** | `public.user_roles` (`admin` / `user`) | Access to `/admin`: users, system prompt, every chat, feature flags | SQL (below) |
| **Tier** | `profiles.tier` (`free` / `go` / `pro` / `exclusive`) | Which models an account can use, token quota, chat memory | Admin console → **Users** → ⋯ → **Change plan**, or SQL |

A role is not a tier. Making someone `pro` gives them a bigger plan; it does not
let them into the console. Making someone `admin` opens the console; it does not
change their quota.

Run any of the SQL below in the **Supabase dashboard → SQL Editor**.

## Make someone an admin

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('person@example.com')
on conflict (user_id, role) do nothing;
```

`auth.users` rather than `public.profiles` on purpose: the profile row is
created by a trigger and can be missing, but the auth row always exists for
anyone who has signed up. If the account has never signed up this inserts
nothing — there is no user to grant to yet.

## Take admin away

```sql
delete from public.user_roles
where role = 'admin'
  and user_id in (select id from auth.users where lower(email) = lower('person@example.com'));
```

Nothing stops you removing your own admin row, and if you remove the last one
the console locks everybody out until you add one back with the SQL above.

## See who is an admin

```sql
select u.email, r.role, r.created_at
from public.user_roles r
join auth.users u on u.id = r.user_id
where r.role = 'admin'
order by r.created_at;
```

## Change someone's plan

The console does this without SQL: **Users** tab → ⋯ on the row → **Change
plan**. In SQL:

```sql
update public.profiles
set tier = 'pro'::public.account_tier   -- free | go | pro | exclusive
where lower(email) = lower('person@example.com');
```

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

At that point the role exists and grants **nothing**. Permissions are not
derived from the name — every gate is written explicitly, in one of two places:

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
