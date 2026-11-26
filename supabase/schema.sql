create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  staff_code  text not null unique,
  full_name   text not null check (char_length(full_name) between 1 and 120),
  role        text not null default 'Staff' check (char_length(role) between 1 and 80),
  email       text,
  is_admin    boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar text;
alter table public.profiles add column if not exists avatar_v timestamptz;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles drop constraint if exists profiles_avatar_chk;
alter table public.profiles add constraint profiles_avatar_chk check (
  avatar is null or (char_length(avatar) <= 40000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$')
);

create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('lobby', 'group', 'direct')),
  name        text check (name is null or char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  direct_key  text unique,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rooms_direct_key_chk check (
    (type = 'direct' and direct_key is not null) or
    (type <> 'direct' and direct_key is null)
  ),
  constraint rooms_name_chk check (type = 'direct' or name is not null)
);

create unique index if not exists rooms_single_lobby on public.rooms ((type)) where type = 'lobby';

create table if not exists public.room_members (
  room_id     uuid not null references public.rooms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'admin', 'member')),
  joined_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members (user_id);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete restrict,
  content    text not null check (char_length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_room_created_idx on public.messages (room_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id);

alter table public.messages alter column sender_id drop not null;
alter table public.messages drop constraint if exists messages_sender_id_fkey;
alter table public.messages add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete set null;

alter table public.messages add column if not exists mentions uuid[] not null default '{}';
alter table public.messages drop constraint if exists messages_mentions_len_chk;
alter table public.messages add constraint messages_mentions_len_chk check (cardinality(mentions) <= 50);

create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reads_user_idx on public.message_reads (user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.is_active and p.is_admin);
$$;

create or replace function public.is_room_member(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.room_members m
    where m.room_id = rid and m.user_id = (select auth.uid()));
$$;

create or replace function public.is_room_manager(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.room_members m
    join public.rooms r on r.id = m.room_id
    where m.room_id = rid and r.type = 'group'
      and m.user_id = (select auth.uid()) and m.member_role in ('owner', 'admin'));
$$;

create or replace function public.room_type_of(rid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select r.type from public.rooms r where r.id = rid;
$$;

create or replace function public.message_room(mid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.room_id from public.messages m where m.id = mid;
$$;

create or replace function public.is_active_profile(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.is_active);
$$;

create or replace function public.create_group(p_name text, p_description text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  rid uuid;
  uid uuid;
begin
  if me is null or not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'nama grup harus 1-80 karakter';
  end if;

  insert into public.rooms (type, name, description, created_by)
  values ('group', btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), me)
  returning id into rid;

  insert into public.room_members (room_id, user_id, member_role) values (rid, me, 'owner');

  foreach uid in array coalesce(p_members, '{}') loop
    if uid <> me and public.is_active_profile(uid) then
      insert into public.room_members (room_id, user_id) values (rid, uid)
      on conflict do nothing;
    end if;
  end loop;
  return rid;
end $$;

create or replace function public.create_direct_room(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  k text;
  rid uuid;
begin
  if me is null or not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_other is null or p_other = me or not public.is_active_profile(p_other) then
    raise exception 'lawan bicara tidak valid';
  end if;

  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);

  insert into public.rooms (type, direct_key, created_by)
  values ('direct', k, me)
  on conflict (direct_key) do nothing
  returning id into rid;

  if rid is null then
    select id into rid from public.rooms where direct_key = k;
  end if;

  insert into public.room_members (room_id, user_id)
  values (rid, me), (rid, p_other)
  on conflict do nothing;
  return rid;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    new.is_admin   := old.is_admin;
    new.is_active  := old.is_active;
    new.staff_code := old.staff_code;
    new.id         := old.id;
    new.email      := old.email;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();

create table if not exists public.staff_roster (
  email       text primary key,
  staff_code  text unique,
  full_name   text not null,
  role        text not null default 'Staff',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint staff_roster_email_chk check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint staff_roster_code_chk check (staff_code is null or char_length(staff_code) between 1 and 40),
  constraint staff_roster_name_chk check (char_length(full_name) between 1 and 120),
  constraint staff_roster_role_chk check (char_length(role) between 1 and 80)
);

drop trigger if exists staff_roster_set_updated_at on public.staff_roster;
create trigger staff_roster_set_updated_at before update on public.staff_roster
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  em text := lower(btrim(coalesce(new.email, '')));
  r public.staff_roster;
  code text;
  fname text;
  rname text;
begin
  select * into r from public.staff_roster where email = em;
  if found then
    code := r.staff_code;
    fname := r.full_name;
    rname := r.role;
  elsif exists (select 1 from public.staff_roster) then
    raise exception 'email tidak terdaftar sebagai staff';
  else
    code := nullif(btrim(coalesce(new.raw_user_meta_data->>'staff_code', '')), '');
    fname := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
    rname := nullif(btrim(coalesce(new.raw_user_meta_data->>'role', '')), '');
  end if;
  if code is null or exists (select 1 from public.profiles where staff_code = code) then
    code := 'NEW-' || replace(new.id::text, '-', '');
  end if;
  fname := coalesce(fname, nullif(split_part(em, '@', 1), ''), 'Staff');
  insert into public.profiles (id, staff_code, full_name, role, email)
  values (new.id, left(code, 40), left(fname, 120), left(coalesce(rname, 'Staff'), 80), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.add_active_profile_to_lobby()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active then
    insert into public.room_members (room_id, user_id)
    select r.id, new.id from public.rooms r where r.type = 'lobby'
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profiles_join_lobby on public.profiles;
create trigger profiles_join_lobby after insert or update of is_active on public.profiles
  for each row execute function public.add_active_profile_to_lobby();

create or replace function public.sanitize_message_mentions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.mentions := coalesce((
    select array_agg(distinct m.user_id)
    from public.room_members m
    where m.room_id = new.room_id
      and m.user_id = any(new.mentions)
      and m.user_id <> new.sender_id
  ), '{}'::uuid[]);
  return new;
end $$;

drop trigger if exists messages_sanitize_mentions on public.messages;
create trigger messages_sanitize_mentions before insert on public.messages
  for each row execute function public.sanitize_message_mentions();

alter table public.rooms add column if not exists last_message_at timestamptz;
create index if not exists rooms_last_message_idx on public.rooms (last_message_at desc nulls last);

update public.rooms r set last_message_at = s.m
from (select room_id, max(created_at) as m from public.messages group by room_id) s
where s.room_id = r.id and r.last_message_at is null;

create or replace function public.touch_room_on_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms set last_message_at = new.created_at where id = new.room_id;
  return new;
end $$;

drop trigger if exists messages_touch_room on public.messages;
create trigger messages_touch_room after insert on public.messages
  for each row execute function public.touch_room_on_message();

create or replace function public.is_room_owner(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.room_members m
    join public.rooms r on r.id = m.room_id
    where m.room_id = rid and r.type = 'group'
      and m.user_id = (select auth.uid()) and m.member_role = 'owner');
$$;

create or replace function public.set_member_role(p_room uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_room_owner(p_room) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'peran tidak valid';
  end if;
  update public.room_members set member_role = p_role
  where room_id = p_room and user_id = p_user and member_role <> 'owner';
  if not found then
    raise exception 'anggota tidak ditemukan';
  end if;
end $$;

drop function if exists public.import_roster(jsonb, boolean);

create or replace function public.import_roster(p_rows jsonb, p_apply boolean default false, p_sync boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  item jsonb;
  i int := 0;
  em text; code text; fname text; rname text;
  st text; msg text;
  all_e text[] := '{}';
  seen_e text[] := '{}';
  seen_c text[] := '{}';
  cur public.staff_roster;
  rec record;
  rows_out jsonb := '[]'::jsonb;
  todo jsonb := '[]'::jsonb;
  del_users jsonb := '[]'::jsonb;
  new_accounts jsonb := '[]'::jsonb;
  c_new int := 0; c_upd int := 0; c_same int := 0; c_err int := 0; c_del int := 0; c_acc int := 0;
  blocked boolean := false;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'data tidak valid, maksimal 500 baris';
  end if;

  select coalesce(array_agg(lower(btrim(coalesce(x->>'email', '')))), '{}')
  into all_e from jsonb_array_elements(p_rows) x;

  for item in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    st := null; msg := null;
    em := lower(btrim(coalesce(item->>'email', '')));
    code := nullif(btrim(coalesce(item->>'staff_code', '')), '');
    fname := btrim(coalesce(item->>'full_name', ''));
    rname := coalesce(nullif(btrim(coalesce(item->>'role', '')), ''), 'Staff');

    if em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      st := 'gagal'; msg := 'email tidak valid';
    elsif fname = '' or char_length(fname) > 120 then
      st := 'gagal'; msg := 'nama kosong atau lebih dari 120 karakter';
    elsif char_length(rname) > 80 then
      st := 'gagal'; msg := 'role lebih dari 80 karakter';
    elsif code is not null and char_length(code) > 40 then
      st := 'gagal'; msg := 'kode staff lebih dari 40 karakter';
    elsif em = any(seen_e) then
      st := 'gagal'; msg := 'email ganda di file';
    elsif code is not null and code = any(seen_c) then
      st := 'gagal'; msg := 'kode staff ganda di file';
    elsif code is not null and exists (
      select 1 from public.staff_roster x
      where x.staff_code = code and x.email <> em
        and (not p_sync or x.email = any(all_e)
             or exists (select 1 from public.profiles pa where lower(coalesce(pa.email, '')) = x.email and pa.is_admin))
    ) then
      st := 'gagal'; msg := 'kode staff dipakai email lain';
    elsif code is not null and exists (
      select 1 from public.profiles p
      where p.staff_code = code and lower(coalesce(p.email, '')) <> em
        and (not p_sync or p.is_admin or lower(coalesce(p.email, '')) = any(all_e))
    ) then
      st := 'gagal'; msg := 'kode staff dipakai akun lain';
    end if;

    if st is null then
      seen_e := seen_e || em;
      if code is not null then seen_c := seen_c || code; end if;
      select * into cur from public.staff_roster where email = em;
      if not found then
        st := 'baru';
      elsif cur.full_name = fname and cur.role = rname and cur.staff_code is not distinct from code then
        st := 'sama';
      else
        st := 'ubah';
      end if;
      todo := todo || jsonb_build_object('em', em, 'code', code, 'fname', fname, 'rname', rname, 'st', st);
    end if;

    if st = 'baru' then c_new := c_new + 1;
    elsif st = 'ubah' then c_upd := c_upd + 1;
    elsif st = 'sama' then c_same := c_same + 1;
    else c_err := c_err + 1;
    end if;

    rows_out := rows_out || jsonb_build_object(
      'row', i, 'email', em, 'full_name', fname, 'role', rname,
      'staff_code', code, 'status', st, 'message', msg);
  end loop;

  if p_sync then
    if c_err > 0 or cardinality(seen_e) = 0 then
      blocked := true;
    else
      for rec in
        select * from (
          select p.id, lower(coalesce(p.email, '')) as email, p.full_name, p.role, p.staff_code, 'akun dihapus' as note
          from public.profiles p
          where not p.is_admin and p.id is distinct from me
            and not (lower(coalesce(p.email, '')) = any(seen_e))
          union all
          select null::uuid, r.email, r.full_name, r.role, r.staff_code, 'belum punya akun'
          from public.staff_roster r
          where not (r.email = any(seen_e))
            and not exists (select 1 from public.profiles p2 where lower(coalesce(p2.email, '')) = r.email)
        ) q order by q.email
      loop
        c_del := c_del + 1;
        rows_out := rows_out || jsonb_build_object(
          'row', null, 'email', rec.email, 'full_name', rec.full_name, 'role', rec.role,
          'staff_code', rec.staff_code, 'status', 'hapus', 'message', rec.note, 'user_id', rec.id);
        if rec.id is not null then
          del_users := del_users || jsonb_build_object('id', rec.id, 'email', rec.email);
        end if;
        if p_apply then
          delete from public.staff_roster where email = rec.email;
        end if;
      end loop;
    end if;
  end if;

  select coalesce(jsonb_agg(e order by e), '[]'::jsonb), count(*)
  into new_accounts, c_acc
  from unnest(seen_e) e
  where not exists (select 1 from public.profiles p where lower(coalesce(p.email, '')) = e);

  if p_apply then
    for item in select value from jsonb_array_elements(todo) loop
      em := item->>'em';
      code := item->>'code';
      fname := item->>'fname';
      rname := item->>'rname';
      if item->>'st' in ('baru', 'ubah') then
        insert into public.staff_roster (email, staff_code, full_name, role)
        values (em, code, fname, rname)
        on conflict (email) do update
          set staff_code = excluded.staff_code, full_name = excluded.full_name, role = excluded.role;
      end if;
      update public.profiles
      set full_name = fname, role = rname, staff_code = coalesce(code, staff_code)
      where lower(email) = em
        and (full_name <> fname or role <> rname or (code is not null and staff_code <> code));
    end loop;
  end if;

  return jsonb_build_object(
    'applied', coalesce(p_apply, false),
    'sync', coalesce(p_sync, false),
    'delete_blocked', blocked,
    'counts', jsonb_build_object('baru', c_new, 'ubah', c_upd, 'sama', c_same, 'gagal', c_err, 'hapus', c_del, 'akun', c_acc),
    'delete_users', del_users,
    'create_emails', new_accounts,
    'rows', rows_out);
end $$;

create or replace function public.admin_set_staff(p_user uuid, p_active boolean, p_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'tidak bisa mengubah akun sendiri';
  end if;
  update public.profiles
  set is_active = coalesce(p_active, is_active), is_admin = coalesce(p_admin, is_admin)
  where id = p_user;
  if not found then
    raise exception 'staff tidak ditemukan';
  end if;
end $$;

create or replace function public.touch_avatar_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.avatar is distinct from old.avatar then
    new.avatar_v := case when new.avatar is null then null else now() end;
  end if;
  return new;
end $$;

drop trigger if exists profiles_avatar_version on public.profiles;
create trigger profiles_avatar_version before update of avatar on public.profiles
  for each row execute function public.touch_avatar_version();

create or replace function public.cleanup_deleted_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
  successor uuid;
begin
  delete from public.rooms rm
  where rm.type = 'direct'
    and exists (select 1 from public.room_members m where m.room_id = rm.id and m.user_id = old.id);

  for r in
    select m.room_id, m.member_role
    from public.room_members m
    join public.rooms rm on rm.id = m.room_id
    where m.user_id = old.id and rm.type = 'group'
  loop
    select m.user_id into successor
    from public.room_members m
    where m.room_id = r.room_id and m.user_id <> old.id
    order by (m.member_role = 'admin') desc, m.joined_at asc, m.user_id
    limit 1;
    if successor is null then
      delete from public.rooms where id = r.room_id;
    elsif r.member_role = 'owner' then
      update public.room_members set member_role = 'owner'
      where room_id = r.room_id and user_id = successor;
    end if;
  end loop;
  return old;
end $$;

drop trigger if exists profiles_cleanup_delete on public.profiles;
create trigger profiles_cleanup_delete before delete on public.profiles
  for each row execute function public.cleanup_deleted_profile();

create table if not exists public.password_reset_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists password_reset_one_pending
  on public.password_reset_requests (user_id) where status = 'pending';
create index if not exists password_reset_status_idx
  on public.password_reset_requests (status, requested_at desc);

create or replace function public.request_password_reset(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  em text := lower(btrim(coalesce(p_email, '')));
begin
  if em = '' or char_length(em) > 254 then
    return;
  end if;
  select p.id into uid from public.profiles p where lower(p.email) = em and p.is_active;
  if uid is null then
    return;
  end if;
  if exists (
    select 1 from public.password_reset_requests q
    where q.user_id = uid and q.requested_at > now() - interval '2 minutes'
  ) then
    return;
  end if;
  insert into public.password_reset_requests (user_id) values (uid) on conflict do nothing;
end $$;

create or replace function public.reject_reset_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.password_reset_requests
  set status = 'rejected', resolved_at = now(), resolved_by = (select auth.uid())
  where id = p_id and status = 'pending';
  if not found then
    raise exception 'permintaan tidak ditemukan';
  end if;
end $$;

create or replace function public.finish_password_change()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.profiles set must_change_password = false where id = (select auth.uid());
end $$;

drop table if exists public.staff_directory cascade;
drop function if exists public.sync_directory_to_profile();

insert into public.rooms (type, name, description)
select 'lobby', 'Lobby Klinik', 'Ruang komunikasi utama seluruh staff klinik'
where not exists (select 1 from public.rooms where type = 'lobby');

insert into public.room_members (room_id, user_id)
select r.id, p.id from public.rooms r cross join public.profiles p
where r.type = 'lobby' and p.is_active
on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.messages;      exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.message_reads; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.room_members;  exception when duplicate_object then null; end;
  end if;
end $$;
