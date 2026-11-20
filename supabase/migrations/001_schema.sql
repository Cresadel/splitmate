-- SplitMate schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text unique, avatar_url text,
  created_at timestamptz default now(), updated_at timestamptz default now());

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0), description text, image_url text,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now());

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz default now(), unique (group_id, user_id));

create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null, description text,
  amount numeric(12,2) not null check (amount > 0),
  category text default 'Others',
  paid_by uuid not null references profiles(id),
  split_type text not null default 'equal' check (split_type in ('equal','custom')),
  expense_date date not null default current_date,
  created_at timestamptz default now(), updated_at timestamptz default now());

create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  share_amount numeric(12,2) not null check (share_amount >= 0),
  created_at timestamptz default now(), unique (expense_id, user_id));

create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  paid_by uuid not null references profiles(id),
  received_by uuid not null references profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  note text, settlement_date date not null default current_date,
  created_at timestamptz default now(), check (paid_by <> received_by));

create index on group_members (user_id);
create index on group_members (group_id);
create index on expenses (group_id, expense_date desc);
create index on expense_splits (expense_id);
create index on expense_splits (user_id);
create index on settlements (group_id);

-- Helper functions (security definer avoids RLS recursion)
create function is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from group_members where group_id = gid and user_id = auth.uid()) $$;

create function is_group_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'owner') $$;

create function shares_group_with(uid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from group_members a join group_members b on a.group_id = b.group_id
   where a.user_id = auth.uid() and b.user_id = uid) $$;

create function expense_group(eid uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select group_id from expenses where id = eid $$;

-- Triggers
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), lower(new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function handle_new_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger on_group_created after insert on groups
  for each row execute function handle_new_group();

-- Add member by exact email (owner only)
create function add_member_by_email(gid uuid, member_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_group_owner(gid) then raise exception 'Only the group owner can add members'; end if;
  select id into uid from profiles where email = lower(trim(member_email));
  if uid is null then raise exception 'No registered user with that email'; end if;
  insert into group_members (group_id, user_id) values (gid, uid) on conflict do nothing;
end $$;

-- Raw balance components, calculated dynamically (no stored balances).
-- Net = paid - shares + settlements paid - settlements received
create function group_balances(gid uuid)
returns table (user_id uuid, paid numeric, shares numeric, settled_paid numeric, settled_received numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_group_member(gid) then raise exception 'Not a member of this group'; end if;
  return query
  select m.user_id,
    coalesce((select sum(e.amount) from expenses e where e.group_id = gid and e.paid_by = m.user_id), 0),
    coalesce((select sum(s.share_amount) from expense_splits s join expenses e on e.id = s.expense_id
              where e.group_id = gid and s.user_id = m.user_id), 0),
    coalesce((select sum(t.amount) from settlements t where t.group_id = gid and t.paid_by = m.user_id), 0),
    coalesce((select sum(t.amount) from settlements t where t.group_id = gid and t.received_by = m.user_id), 0)
  from group_members m where m.group_id = gid;
end $$;

-- Atomic expense + splits. p_splits = [{"user_id":"...","share":300.00}, ...]
create function create_expense(p_group uuid, p_title text, p_description text, p_amount numeric,
  p_category text, p_paid_by uuid, p_split_type text, p_date date, p_splits jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare eid uuid; total numeric; r jsonb;
begin
  if not is_group_member(p_group) then raise exception 'Not a member of this group'; end if;
  if p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if not exists (select 1 from group_members where group_id = p_group and user_id = p_paid_by)
    then raise exception 'Payer must be a group member'; end if;
  select coalesce(sum((x->>'share')::numeric), 0) into total from jsonb_array_elements(p_splits) x;
  if jsonb_array_length(p_splits) = 0 or round(total,2) <> round(p_amount,2)
    then raise exception 'Shares must add up to the total amount'; end if;
  insert into expenses (group_id, title, description, amount, category, paid_by, split_type, expense_date)
  values (p_group, p_title, p_description, p_amount, p_category, p_paid_by, p_split_type, p_date)
  returning id into eid;
  for r in select * from jsonb_array_elements(p_splits) loop
    if not exists (select 1 from group_members where group_id = p_group and user_id = (r->>'user_id')::uuid)
      then raise exception 'Participant must be a group member'; end if;
    insert into expense_splits (expense_id, user_id, share_amount)
    values (eid, (r->>'user_id')::uuid, (r->>'share')::numeric);
  end loop;
  return eid;
end $$;

-- Settlement: payer cannot pay more than their net debt in the group
create function create_settlement(p_group uuid, p_received_by uuid, p_amount numeric, p_note text, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare debt numeric; sid uuid;
begin
  if not is_group_member(p_group) then raise exception 'Not a member of this group'; end if;
  if not exists (select 1 from group_members where group_id = p_group and user_id = p_received_by)
    then raise exception 'Receiver must be a group member'; end if;
  select (b.paid - b.shares + b.settled_paid - b.settled_received) into debt
    from group_balances(p_group) b where b.user_id = auth.uid();
  if debt >= 0 then raise exception 'You have no outstanding debt in this group'; end if;
  if p_amount > -debt then raise exception 'Amount exceeds your outstanding debt'; end if;
  insert into settlements (group_id, paid_by, received_by, amount, note, settlement_date)
  values (p_group, auth.uid(), p_received_by, p_amount, p_note, p_date) returning id into sid;
  return sid;
end $$;

-- Row Level Security
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlements enable row level security;

create policy profiles_select on profiles for select using (id = auth.uid() or shares_group_with(id));
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (full_name, avatar_url) on profiles to authenticated;

create policy groups_select on groups for select using (created_by = auth.uid() or is_group_member(id));
create policy groups_insert on groups for insert with check (created_by = auth.uid());
create policy groups_update on groups for update using (is_group_owner(id));
create policy groups_delete on groups for delete using (is_group_owner(id));

create policy gm_select on group_members for select using (is_group_member(group_id));
create policy gm_delete on group_members for delete
  using ((is_group_owner(group_id) and role <> 'owner') or user_id = auth.uid());

create policy exp_select on expenses for select using (is_group_member(group_id));
create policy exp_delete on expenses for delete using (is_group_owner(group_id) or paid_by = auth.uid());

create policy es_select on expense_splits for select using (is_group_member(expense_group(expense_id)));
create policy set_select on settlements for select using (is_group_member(group_id));
-- Inserts into expenses/splits/settlements/members happen only via the functions above.
