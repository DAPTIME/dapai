alter table public.chats
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists chats_deleted_at_idx on public.chats (deleted_at) where deleted_at is null;