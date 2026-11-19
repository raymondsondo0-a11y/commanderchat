-- CommanderChat database setup. Run this entire file in Supabase SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member',
  avatar_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);
create or replace function public.create_direct_conversation(target_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare current_user_id uuid := auth.uid(); found_id uuid; new_id uuid;
begin
  if current_user_id is null then raise exception 'You must be logged in'; end if;
  if target_user = current_user_id then raise exception 'You cannot chat with yourself'; end if;
  if not exists(select 1 from public.profiles where id=target_user) then raise exception 'User not found'; end if;
  select c.id into found_id from public.conversations c
  join public.conversation_members a on a.conversation_id=c.id and a.user_id=current_user_id
  join public.conversation_members b on b.conversation_id=c.id and b.user_id=target_user
  where c.is_group=false
  and (select count(*) from public.conversation_members x where x.conversation_id=c.id)=2
  limit 1;
  if found_id is not null then return found_id; end if;
  insert into public.conversations(is_group) values(false) returning id into new_id;
  insert into public.conversation_members(conversation_id,user_id) values(new_id,current_user_id),(new_id,target_user);
  return new_id;
end; $$;
create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as 'select exists (select 1 from public.conversation_members where conversation_id = target_conversation and user_id = auth.uid())';
grant execute on function public.is_conversation_member(uuid) to authenticated;
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
create policy "Profiles are visible to authenticated users" on public.profiles for select to authenticated using(true);
create policy "Users can create own profile" on public.profiles for insert to authenticated with check(id=auth.uid());
create policy "Users can update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "Members can view conversations" on public.conversations for select to authenticated using(public.is_conversation_member(id));
create policy "Members can view membership" on public.conversation_members for select to authenticated using(public.is_conversation_member(conversation_id));
create policy "Members can view messages" on public.messages for select to authenticated using(public.is_conversation_member(conversation_id));
create policy "Members can send messages" on public.messages for insert to authenticated with check(sender_id=auth.uid() and public.is_conversation_member(conversation_id));
create policy "Recipients can mark messages read" on public.messages for update to authenticated using(exists(select 1 from public.conversation_members m where m.conversation_id=messages.conversation_id and m.user_id=auth.uid()) and sender_id<>auth.uid()) with check(public.is_conversation_member(conversation_id));
grant execute on function public.create_direct_conversation(uuid) to authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select on public.conversations,public.conversation_members to authenticated;
grant select,insert,update on public.messages to authenticated;
alter publication supabase_realtime add table public.messages;