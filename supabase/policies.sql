alter table public.profiles      enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.messages      enable row level security;
alter table public.message_reads enable row level security;
alter table public.staff_roster  enable row level security;
alter table public.password_reset_requests enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;

grant select, update (full_name, role, avatar) on public.profiles to authenticated;
grant select on public.password_reset_requests to authenticated;
grant select                           on public.staff_roster  to authenticated;
grant select, update (name, description) on public.rooms        to authenticated;
grant select, insert, delete            on public.room_members  to authenticated;
grant select, insert                    on public.messages      to authenticated;
grant select, insert                    on public.message_reads to authenticated;

grant execute on function public.is_active_user()          to authenticated;
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.is_room_member(uuid)      to authenticated;
grant execute on function public.is_room_manager(uuid)     to authenticated;
grant execute on function public.room_type_of(uuid)        to authenticated;
grant execute on function public.message_room(uuid)        to authenticated;
grant execute on function public.is_active_profile(uuid)   to authenticated;
grant execute on function public.create_group(text, text, uuid[]) to authenticated;
grant execute on function public.create_direct_room(uuid)  to authenticated;
grant execute on function public.is_room_owner(uuid)       to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.import_roster(jsonb, boolean, boolean) to authenticated;
grant execute on function public.reject_reset_request(uuid) to authenticated;
grant execute on function public.finish_password_change() to authenticated;
grant execute on function public.request_password_reset(text) to anon, authenticated;
grant execute on function public.admin_set_staff(uuid, boolean, boolean) to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user() and (is_active or id = (select auth.uid()) or public.is_admin()));

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

drop policy if exists rooms_select_member on public.rooms;
create policy rooms_select_member on public.rooms for select to authenticated
  using (public.is_room_member(id));

drop policy if exists rooms_update_manager on public.rooms;
create policy rooms_update_manager on public.rooms for update to authenticated
  using (public.is_room_manager(id))
  with check (public.is_room_manager(id));

drop policy if exists room_members_select on public.room_members;
create policy room_members_select on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists room_members_insert_manager on public.room_members;
create policy room_members_insert_manager on public.room_members for insert to authenticated
  with check (
    public.is_room_manager(room_id)
    and member_role = 'member'
    and public.is_active_profile(user_id)
  );

drop policy if exists room_members_delete on public.room_members;
create policy room_members_delete on public.room_members for delete to authenticated
  using (
    public.room_type_of(room_id) = 'group'
    and member_role <> 'owner'
    and (
      user_id = (select auth.uid())
      or (public.is_room_manager(room_id) and (member_role = 'member' or public.is_room_owner(room_id)))
    )
  );

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_room_member(room_id));

drop policy if exists message_reads_select on public.message_reads;
create policy message_reads_select on public.message_reads for select to authenticated
  using (public.is_room_member(public.message_room(message_id)));

drop policy if exists message_reads_insert_self on public.message_reads;
create policy message_reads_insert_self on public.message_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_room_member(public.message_room(message_id)));

drop policy if exists staff_roster_select_admin on public.staff_roster;
create policy staff_roster_select_admin on public.staff_roster for select to authenticated
  using (public.is_admin());

drop policy if exists password_reset_select_admin on public.password_reset_requests;
create policy password_reset_select_admin on public.password_reset_requests for select to authenticated
  using (public.is_admin());
