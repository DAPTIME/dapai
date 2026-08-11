-- A place to run the site from the Supabase dashboard.
--
-- Roles live in public.user_roles and tiers live in profiles.tier, which
-- means changing either by hand is a join and an insert against two tables
-- and auth.users. This puts one editable view in front of both.
--
-- It deliberately does NOT go in the public schema. PostgREST only exposes
-- public and graphql_public, so nothing here is reachable over the API no
-- matter what grants say — and the grants below say anon and authenticated
-- get nothing anyway. The view exposes every user's email; it is for the
-- dashboard and the service role, nobody else.
create schema if not exists admin;
comment on schema admin is
  'Owner tooling for the Supabase dashboard. Not exposed via PostgREST. Never grant to anon or authenticated.';

revoke all on schema admin from public;
grant usage on schema admin to postgres, service_role;

-- One row per account, joining what is otherwise three tables.
create or replace view admin.users as
select
  u.id,
  u.email,
  p.name,
  p.tier,
  exists (
    select 1 from public.user_roles r
    where r.user_id = u.id and r.role = 'admin'
  ) as is_admin,
  (
    select coalesce(string_agg(r.role::text, ', ' order by r.role::text), '')
    from public.user_roles r where r.user_id = u.id
  ) as roles,
  u.email_confirmed_at is not null as email_confirmed,
  u.last_sign_in_at,
  u.created_at
from auth.users u
left join public.profiles p on p.id = u.id;

comment on view admin.users is
  'Editable. Change tier or tick is_admin in the Table Editor and the write is routed to profiles / user_roles. email and id are read-only.';

-- Writes go to the underlying tables. SECURITY DEFINER so the behaviour is
-- the same whether the caller is the dashboard (postgres) or the service
-- role, and search_path is pinned so it cannot be redirected.
create or replace function admin.users_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admins integer;
begin
  if new.id is distinct from old.id then
    raise exception 'id is read-only here.';
  end if;

  if new.email is distinct from old.email then
    raise exception
      'Change an email under Authentication → Users, not here. The app reads profiles.email and the two must not drift apart.';
  end if;

  if new.name is distinct from old.name or new.tier is distinct from old.tier then
    update public.profiles
       set name = coalesce(new.name, name),
           tier = coalesce(new.tier, tier)
     where id = old.id;
    if not found then
      raise exception
        'No profile row for % — the account exists in auth.users but was never given a profile.', old.email;
    end if;
  end if;

  if coalesce(new.is_admin, false) and not coalesce(old.is_admin, false) then
    insert into public.user_roles (user_id, role)
    values (old.id, 'admin')
    on conflict (user_id, role) do nothing;

  elsif not coalesce(new.is_admin, false) and coalesce(old.is_admin, false) then
    select count(*) into v_admins from public.user_roles where role = 'admin';
    if v_admins <= 1 then
      raise exception
        'Refusing to remove the last admin — the console would lock everyone out. Grant admin to another account first.';
    end if;
    delete from public.user_roles where user_id = old.id and role = 'admin';
  end if;

  return new;
end;
$$;

drop trigger if exists users_update on admin.users;
create trigger users_update
  instead of update on admin.users
  for each row execute function admin.users_update();

-- One-liners for the SQL editor, for when the Table Editor is more clicking
-- than the change is worth.
create or replace function admin.set_admin(p_email text, p_is_admin boolean default true)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_admins integer;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No account with the email %. They have to sign up first.', p_email;
  end if;

  if p_is_admin then
    insert into public.user_roles (user_id, role) values (v_id, 'admin')
    on conflict (user_id, role) do nothing;
    return format('%s is now an admin.', p_email);
  end if;

  select count(*) into v_admins from public.user_roles where role = 'admin';
  if v_admins <= 1 then
    raise exception
      'Refusing to remove the last admin — the console would lock everyone out. Grant admin to another account first.';
  end if;
  delete from public.user_roles where user_id = v_id and role = 'admin';
  return format('%s is no longer an admin.', p_email);
end;
$$;

create or replace function admin.set_tier(p_email text, p_tier public.account_tier)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No account with the email %. They have to sign up first.', p_email;
  end if;

  update public.profiles set tier = p_tier where id = v_id;
  if not found then
    raise exception 'No profile row for % — nothing to set a tier on.', p_email;
  end if;
  return format('%s is now on the %s plan.', p_email, p_tier);
end;
$$;

-- Nothing in here is for the browser.
revoke all on all tables in schema admin from public, anon, authenticated;
revoke all on all functions in schema admin from public, anon, authenticated;
grant select, update on admin.users to postgres, service_role;
grant execute on function admin.set_admin(text, boolean) to postgres, service_role;
grant execute on function admin.set_tier(text, public.account_tier) to postgres, service_role;
