begin;
delete from public.staff_roster;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_su() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.must_fail(label text, q text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'PASS: % (ditolak: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (seharusnya ditolak)', label;
end $$;

create function pg_temp.must_equal(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL: % (dapat %, seharusnya %)', label, got, want;
  end if;
  raise notice 'PASS: %', label;
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  c uuid := '00000000-0000-0000-0000-00000000000c';
  d uuid := '00000000-0000-0000-0000-00000000000d';
  adm uuid := '00000000-0000-0000-0000-0000000000ad';
  lobby uuid; grp uuid; dm1 uuid; dm2 uuid; msg uuid; n bigint;
begin
  perform pg_temp.as_su();
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'a@test', '{"staff_code":"T-A","full_name":"Staff A","role":"Perawat"}'),
    (b, 'b@test', '{"staff_code":"T-B","full_name":"Staff B","role":"Dokter"}'),
    (c, 'c@test', '{"staff_code":"T-C","full_name":"Staff C","role":"Admin Loket"}'),
    (d, 'd@test', '{"staff_code":"T-D","full_name":"Staff D","role":"Apoteker"}'),
    (adm, 'adm@test', '{"staff_code":"T-ADM","full_name":"Admin","role":"Admin"}');
  update public.profiles set is_admin = true where id = adm;

  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-00000000000e', 'e@test', '{"staff_code":"T-A","full_name":"Staff E","role":"Perawat"}'),
    ('00000000-0000-0000-0000-00000000000f', 'f@test',
      jsonb_build_object('staff_code', 'T-F', 'full_name', repeat('n', 300), 'role', repeat('r', 300)));
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000010', 'kosong@test');
  perform pg_temp.must_equal('staff_code ganda diganti otomatis saat daftar',
    (select count(*) from public.profiles where email = 'e@test' and staff_code like 'NEW-%'), 1);
  perform pg_temp.must_equal('nama dan role panjang dipotong, pendaftaran tidak gagal',
    (select count(*) from public.profiles where email = 'f@test' and char_length(full_name) = 120 and char_length(role) = 80), 1);
  perform pg_temp.must_equal('pendaftar tanpa metadata tetap dapat profil',
    (select count(*) from public.profiles where email = 'kosong@test' and full_name = 'kosong' and role = 'Staff'), 1);
  perform pg_temp.must_equal('pendaftar baru tidak pernah menjadi admin',
    (select count(*) from public.profiles where email in ('e@test', 'f@test', 'kosong@test') and is_admin), 0);

  select id into lobby from public.rooms where type = 'lobby';
  perform pg_temp.must_equal('hanya ada 1 lobby', (select count(*) from public.rooms where type='lobby'), 1);
  perform pg_temp.must_fail('lobby kedua tidak bisa dibuat',
    $q$insert into public.rooms (type, name) values ('lobby', 'Lobby Palsu')$q$);
  perform pg_temp.must_equal('staff baru otomatis masuk lobby',
    (select count(*) from public.room_members where room_id = lobby and user_id in (a,b,c,d,adm)), 5);

  perform pg_temp.as_user(a);
  insert into public.messages (room_id, sender_id, content) values (lobby, a, 'Halo semua');
  perform pg_temp.as_user(b);
  perform pg_temp.must_equal('B bisa membaca pesan lobby', (select count(*) from public.messages where room_id = lobby), 1);

  perform pg_temp.as_user(a);
  perform pg_temp.must_fail('A tidak bisa kirim pesan atas nama B',
    format($q$insert into public.messages (room_id, sender_id, content) values (%L, %L, 'palsu')$q$, lobby, b));
  perform pg_temp.must_fail('pesan tidak bisa dihapus staff', $q$delete from public.messages$q$);
  perform pg_temp.must_fail('pesan tidak bisa diubah staff', $q$update public.messages set content = 'x'$q$);
  perform pg_temp.must_fail('staff tidak bisa insert room langsung',
    $q$insert into public.rooms (type, name) values ('group', 'Bypass')$q$);

  grp := public.create_group('Tim Perawat', 'Koordinasi shift', array[b]);
  insert into public.messages (room_id, sender_id, content) values (grp, a, 'rahasia grup');
  perform pg_temp.as_user(b);
  perform pg_temp.must_equal('anggota grup (B) bisa membaca', (select count(*) from public.messages where room_id = grp), 1);
  perform pg_temp.must_fail('anggota biasa (B) tidak bisa menambah anggota',
    format($q$insert into public.room_members (room_id, user_id) values (%L, %L)$q$, grp, d));

  perform pg_temp.as_user(c);
  perform pg_temp.must_equal('non-anggota (C) tidak melihat grup', (select count(*) from public.rooms where id = grp), 0);
  perform pg_temp.must_equal('non-anggota (C) tidak membaca pesan grup', (select count(*) from public.messages where room_id = grp), 0);
  perform pg_temp.must_fail('C tidak bisa kirim ke grup',
    format($q$insert into public.messages (room_id, sender_id, content) values (%L, %L, 'nyelinap')$q$, grp, c));
  perform pg_temp.must_fail('C tidak bisa menambahkan dirinya ke grup',
    format($q$insert into public.room_members (room_id, user_id) values (%L, %L)$q$, grp, c));
  perform pg_temp.must_fail('C tidak bisa menjadikan dirinya owner',
    format($q$insert into public.room_members (room_id, user_id, member_role) values (%L, %L, 'owner')$q$, grp, c));

  perform pg_temp.as_user(adm);
  perform pg_temp.must_equal('admin aplikasi tidak membaca grup privat', (select count(*) from public.messages where room_id = grp), 0);

  perform pg_temp.as_user(a);
  insert into public.room_members (room_id, user_id) values (grp, d);
  perform pg_temp.must_equal('owner (A) bisa menambah anggota', (select count(*) from public.room_members where room_id = grp), 3);
  delete from public.room_members where room_id = grp and user_id = d;
  perform pg_temp.must_equal('owner (A) bisa mengeluarkan anggota', (select count(*) from public.room_members where room_id = grp), 2);
  delete from public.room_members where room_id = grp and user_id = a;
  perform pg_temp.must_equal('owner tidak bisa dikeluarkan lewat delete', (select count(*) from public.room_members where room_id = grp and user_id = a), 1);

  insert into public.messages (room_id, sender_id, content, mentions) values (grp, a, 'tag grup', array[b, c, a, b]);
  perform pg_temp.as_su();
  perform pg_temp.must_equal('tag hanya menyisakan anggota room, bukan diri sendiri, tanpa duplikat',
    (select count(*) from public.messages where content = 'tag grup' and mentions = array[b]), 1);
  perform pg_temp.as_user(a);
  insert into public.messages (room_id, sender_id, content, mentions) values (lobby, a, 'tag lobby', array[c, d]);
  perform pg_temp.as_su();
  perform pg_temp.must_equal('tag di lobby tersimpan untuk anggota lobby',
    (select count(*) from public.messages where content = 'tag lobby' and mentions @> array[c, d] and cardinality(mentions) = 2), 1);
  perform pg_temp.as_user(a);
  insert into public.messages (room_id, sender_id, content, mentions) values (lobby, a, 'tanpa tag', null);
  perform pg_temp.as_su();
  perform pg_temp.must_equal('mentions null menjadi array kosong',
    (select count(*) from public.messages where content = 'tanpa tag' and mentions = '{}'), 1);
  perform pg_temp.as_user(a);

  perform pg_temp.as_su();
  perform pg_temp.must_equal('last_message_at room terisi saat ada pesan',
    (select count(*) from public.rooms where id = grp and last_message_at is not null), 1);
  perform pg_temp.as_user(b);
  perform pg_temp.must_fail('anggota biasa tidak bisa mengangkat admin', format($q$select public.set_member_role(%L, %L, 'admin')$q$, grp, b));
  perform pg_temp.as_user(c);
  perform pg_temp.must_fail('non-anggota tidak bisa mengubah peran', format($q$select public.set_member_role(%L, %L, 'admin')$q$, grp, b));
  perform pg_temp.as_user(a);
  perform pg_temp.must_fail('owner tidak bisa menurunkan dirinya', format($q$select public.set_member_role(%L, %L, 'member')$q$, grp, a));
  perform pg_temp.must_fail('peran owner tidak bisa diberikan lewat fungsi', format($q$select public.set_member_role(%L, %L, 'owner')$q$, grp, b));
  perform public.set_member_role(grp, b, 'admin');
  perform pg_temp.as_su();
  perform pg_temp.must_equal('owner bisa mengangkat admin', (select count(*) from public.room_members where room_id = grp and user_id = b and member_role = 'admin'), 1);
  perform pg_temp.as_user(b);
  insert into public.room_members (room_id, user_id) values (grp, d);
  perform pg_temp.must_equal('admin grup bisa menambah anggota', (select count(*) from public.room_members where room_id = grp and user_id = d), 1);
  perform pg_temp.as_user(a);
  perform public.set_member_role(grp, d, 'admin');
  perform pg_temp.as_user(b);
  delete from public.room_members where room_id = grp and user_id = d;
  perform pg_temp.must_equal('admin tidak bisa mengeluarkan admin lain', (select count(*) from public.room_members where room_id = grp and user_id = d), 1);
  perform pg_temp.as_user(a);
  delete from public.room_members where room_id = grp and user_id = d;
  perform pg_temp.must_equal('owner bisa mengeluarkan admin', (select count(*) from public.room_members where room_id = grp and user_id = d), 0);
  perform pg_temp.as_user(b);
  delete from public.room_members where room_id = grp and user_id = b;
  perform pg_temp.must_equal('admin bisa keluar dari grup', (select count(*) from public.room_members where room_id = grp and user_id = b), 0);
  perform pg_temp.must_equal('setelah keluar, B tidak membaca pesan grup', (select count(*) from public.messages where room_id = grp), 0);

  perform pg_temp.as_user(a);
  dm1 := public.create_direct_room(b);
  perform pg_temp.as_user(b);
  dm2 := public.create_direct_room(a);
  if dm1 <> dm2 then raise exception 'FAIL: chat pribadi duplikat'; end if;
  perform pg_temp.must_equal('chat pribadi A-B tidak duplikat', (select count(*) from public.rooms where type='direct'), 1);
  insert into public.messages (room_id, sender_id, content) values (dm1, b, 'pesan pribadi');
  perform pg_temp.as_user(c);
  perform pg_temp.must_equal('C tidak melihat chat pribadi A-B', (select count(*) from public.messages where room_id = dm1), 0);
  perform pg_temp.must_fail('chat dengan diri sendiri ditolak', format($q$select public.create_direct_room(%L)$q$, c));
  perform pg_temp.must_fail('C tidak bisa masuk chat pribadi A-B',
    format($q$insert into public.room_members (room_id, user_id) values (%L, %L)$q$, dm1, c));

  perform pg_temp.as_user(a);
  select id into msg from public.messages where room_id = dm1 limit 1;
  insert into public.message_reads (message_id, user_id) values (msg, a);
  perform pg_temp.as_user(c);
  perform pg_temp.must_fail('C tidak bisa menandai baca pesan yang bukan miliknya',
    format($q$insert into public.message_reads (message_id, user_id) values (%L, %L)$q$, msg, c));
  perform pg_temp.must_fail('A tidak bisa menandai baca atas nama orang lain',
    format($q$insert into public.message_reads (message_id, user_id) values (%L, %L)$q$, msg, b));

  perform pg_temp.as_user(a);
  perform pg_temp.must_fail('staff tidak bisa menjadikan dirinya admin',
    format($q$update public.profiles set is_admin = true where id = %L$q$, a));
  perform pg_temp.must_fail('staff tidak bisa mengubah staff_code / status aktif',
    format($q$update public.profiles set staff_code = 'HACK', is_active = true where id = %L$q$, a));
  update public.profiles set full_name = 'Staff A Baru' where id = a;
  perform pg_temp.must_equal('staff bisa mengubah nama sendiri',
    (select count(*) from public.profiles where id = a and full_name = 'Staff A Baru'), 1);
  update public.profiles set full_name = 'Diretas' where id = b;
  perform pg_temp.as_su();
  perform pg_temp.must_equal('profil orang lain tetap utuh',
    (select count(*) from public.profiles where id = b and full_name = 'Staff B'), 1);
  perform pg_temp.as_user(a);
  perform pg_temp.must_fail('staff tidak bisa membuat profil palsu',
    format($q$insert into public.profiles (id, staff_code, full_name) values (%L, 'X', 'X')$q$, gen_random_uuid()));

  perform pg_temp.as_su();
  update public.profiles set is_active = false where id = c;
  perform pg_temp.as_user(c);
  perform pg_temp.must_equal('staff nonaktif tidak membaca lobby', (select count(*) from public.messages where room_id = lobby), 0);
  perform pg_temp.must_fail('staff nonaktif tidak bisa kirim',
    format($q$insert into public.messages (room_id, sender_id, content) values (%L, %L, 'masih bisa?')$q$, lobby, c));

  execute 'reset role';
  execute 'set local role anon';
  perform pg_temp.must_fail('anon tidak bisa membaca pesan', $q$select * from public.messages$q$);
  perform pg_temp.must_fail('anon tidak bisa membaca profil', $q$select * from public.profiles$q$);
  perform pg_temp.as_su();

  execute 'reset role';
  execute 'set local role anon';
  perform pg_temp.must_fail('anon tidak bisa membaca roster', $q$select * from public.staff_roster$q$);
  perform pg_temp.as_su();

  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000030', 'lama@klinik.id', '{"staff_code":"T-LAMA","full_name":"Nama Lama","role":"Staff"}');

  perform pg_temp.as_user(a);
  perform pg_temp.must_fail('staff biasa tidak bisa impor roster', $q$select public.import_roster('[{"email":"x@test","full_name":"X"}]'::jsonb, true)$q$);
  perform pg_temp.must_fail('staff biasa tidak bisa mengubah status staff', format($q$select public.admin_set_staff(%L, false, null)$q$, b));
  perform pg_temp.must_equal('staff biasa tidak membaca roster', (select count(*) from public.staff_roster), 0);

  perform pg_temp.as_user(adm);
  perform pg_temp.must_equal('dry run: 2 baru, 1 email ganda, 1 email salah, 1 kode dipakai akun lain', (
    select count(*) from jsonb_array_elements(public.import_roster($j$[
      {"email":"Baru1@Klinik.id","staff_code":"TST-R1","full_name":"Roster Satu","role":"Perawat"},
      {"email":"baru2@klinik.id","staff_code":"TST-R2","full_name":"Roster Dua","role":"Dokter"},
      {"email":"baru1@klinik.id","staff_code":"TST-R9","full_name":"Ganda","role":"Dokter"},
      {"email":"salah","full_name":"Salah"},
      {"email":"bentrok@klinik.id","staff_code":"T-B","full_name":"Bentrok"}
    ]$j$::jsonb, false)->'rows') r where r->>'status' in ('baru', 'gagal')), 5);
  perform pg_temp.must_equal('dry run tidak menulis apa pun', (select count(*) from public.staff_roster), 0);

  perform pg_temp.must_equal('apply: hitungan benar', (
    select (public.import_roster($j$[
      {"email":"Baru1@Klinik.id","staff_code":"TST-R1","full_name":"Roster Satu","role":"Perawat"},
      {"email":"baru2@klinik.id","staff_code":"TST-R2","full_name":"Roster Dua","role":"Dokter"},
      {"email":"baru1@klinik.id","staff_code":"TST-R9","full_name":"Ganda","role":"Dokter"},
      {"email":"salah","full_name":"Salah"},
      {"email":"bentrok@klinik.id","staff_code":"T-B","full_name":"Bentrok"},
      {"email":"lama@klinik.id","staff_code":"T-LAMA","full_name":"Nama Baru","role":"Kepala Perawat"}
    ]$j$::jsonb, true)->'counts'->>'baru')::bigint), 3);
  perform pg_temp.must_equal('roster tersimpan: email huruf kecil, baris gagal tidak masuk', (select count(*) from public.staff_roster where email in ('baru1@klinik.id', 'baru2@klinik.id', 'lama@klinik.id')), 3);
  perform pg_temp.must_equal('baris gagal tidak masuk roster', (select count(*) from public.staff_roster where email in ('salah', 'bentrok@klinik.id')), 0);
  perform pg_temp.must_equal('apply memperbarui profil yang sudah ada', (select count(*) from public.profiles where email = 'lama@klinik.id' and full_name = 'Nama Baru' and role = 'Kepala Perawat'), 1);
  perform pg_temp.must_equal('impor ulang tanpa perubahan = sama', (
    select (public.import_roster('[{"email":"baru2@klinik.id","staff_code":"TST-R2","full_name":"Roster Dua","role":"Dokter"}]'::jsonb, false)->'counts'->>'sama')::bigint), 1);
  perform pg_temp.must_equal('perubahan role terdeteksi sebagai ubah', (
    select (public.import_roster('[{"email":"baru2@klinik.id","staff_code":"TST-R2","full_name":"Roster Dua","role":"Apoteker"}]'::jsonb, false)->'counts'->>'ubah')::bigint), 1);
  perform pg_temp.must_equal('admin membaca roster', (select count(*) from public.staff_roster), 3);
  perform pg_temp.must_fail('lebih dari 500 baris ditolak', $q$select public.import_roster((select jsonb_agg(jsonb_build_object('email', 'x' || g || '@test', 'full_name', 'X')) from generate_series(1, 501) g), false)$q$);

  perform pg_temp.as_su();
  perform pg_temp.must_fail('daftar dengan email di luar roster ditolak',
    $q$insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000020', 'asing@klinik.id')$q$);
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000021', 'baru1@klinik.id', '{"staff_code":"PALSU","full_name":"Nama Palsu","role":"Direktur"}');
  perform pg_temp.must_equal('daftar dengan email roster: nama, role, kode dari roster, bukan dari klien',
    (select count(*) from public.profiles where email = 'baru1@klinik.id' and full_name = 'Roster Satu' and role = 'Perawat' and staff_code = 'TST-R1'), 1);
  perform pg_temp.must_equal('akun dari roster masuk lobby',
    (select count(*) from public.room_members where user_id = '00000000-0000-0000-0000-000000000021' and room_id = lobby), 1);

  perform pg_temp.as_user(adm);
  perform pg_temp.must_fail('admin tidak bisa mengubah akun sendiri', format($q$select public.admin_set_staff(%L, false, null)$q$, adm));
  perform public.admin_set_staff(d, false, null);
  perform pg_temp.must_equal('admin melihat staff nonaktif', (select count(*) from public.profiles where id = d and not is_active), 1);
  perform public.admin_set_staff(d, true, true);
  perform pg_temp.must_equal('admin mengaktifkan dan menjadikan admin', (select count(*) from public.profiles where id = d and is_active and is_admin), 1);
  perform pg_temp.must_fail('staff yang tidak ada ditolak', $q$select public.admin_set_staff('00000000-0000-0000-0000-0000000000ff', true, null)$q$);
  perform pg_temp.as_su();

  raise notice 'SEMUA PENGUJIAN LULUS';
end $$;

do $$
declare
  adm uuid := '00000000-0000-0000-0000-0000000000ad';
  a uuid := '00000000-0000-0000-0000-00000000000a';
  d uuid := '00000000-0000-0000-0000-00000000000d';
  c uuid := '00000000-0000-0000-0000-00000000000c';
  x uuid := '00000000-0000-0000-0000-0000000000a1';
  y uuid := '00000000-0000-0000-0000-0000000000a2';
  z uuid := '00000000-0000-0000-0000-0000000000a3';
  lobby uuid; g1 uuid; g2 uuid; g3 uuid; dmx uuid; req uuid; rep jsonb; big text;
begin
  perform pg_temp.as_su();
  select id into lobby from public.rooms where type = 'lobby';
  insert into public.staff_roster (email, staff_code, full_name, role) values
    ('x@klinik.id', 'TST-X1', 'Staff X', 'Perawat'),
    ('y@klinik.id', 'TST-Y1', 'Staff Y', 'Dokter'),
    ('z@klinik.id', 'TST-Z1', 'Staff Z', 'Apoteker');
  insert into auth.users (id, email) values (x, 'x@klinik.id'), (y, 'y@klinik.id'), (z, 'z@klinik.id');

  perform pg_temp.as_user(x);
  update public.profiles set avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' where id = x;
  perform pg_temp.as_su();
  perform pg_temp.must_equal('foto profil tersimpan dan versinya terisi',
    (select count(*) from public.profiles where id = x and avatar is not null and avatar_v is not null), 1);
  perform pg_temp.as_user(x);
  perform pg_temp.must_fail('foto bukan data gambar ditolak',
    format($q$update public.profiles set avatar = 'javascript:alert(1)' where id = %L$q$, x));
  perform pg_temp.must_fail('foto svg ditolak',
    format($q$update public.profiles set avatar = 'data:image/svg+xml;base64,PHN2Zz4=' where id = %L$q$, x));
  big := 'data:image/jpeg;base64,' || repeat('A', 40000);
  perform pg_temp.must_fail('foto terlalu besar ditolak',
    format($q$update public.profiles set avatar = %L where id = %L$q$, big, x));
  update public.profiles set avatar = 'data:image/png;base64,iVBORw0KGgo=' where id = y;
  perform pg_temp.as_su();
  perform pg_temp.must_equal('foto orang lain tidak bisa diubah',
    (select count(*) from public.profiles where id = y and avatar is null), 1);
  perform pg_temp.as_user(x);
  update public.profiles set avatar = null where id = x;
  perform pg_temp.as_su();
  perform pg_temp.must_equal('hapus foto mengosongkan versi',
    (select count(*) from public.profiles where id = x and avatar is null and avatar_v is null), 1);

  update public.profiles set must_change_password = true where id in (x, y);
  perform pg_temp.as_user(x);
  perform pg_temp.must_fail('staff tidak bisa mengubah penanda ganti password langsung',
    format($q$update public.profiles set must_change_password = false where id = %L$q$, x));
  perform public.finish_password_change();
  perform pg_temp.as_su();
  perform pg_temp.must_equal('selesai ganti password membersihkan penanda sendiri',
    (select count(*) from public.profiles where id = x and not must_change_password), 1);
  perform pg_temp.must_equal('penanda orang lain tidak tersentuh',
    (select count(*) from public.profiles where id = y and must_change_password), 1);
  execute 'reset role';
  execute 'set local role anon';
  perform pg_temp.must_fail('anon tidak bisa memanggil finish_password_change', $q$select public.finish_password_change()$q$);
  perform pg_temp.as_su();

  execute 'reset role';
  execute 'set local role anon';
  perform public.request_password_reset('x@klinik.id');
  perform public.request_password_reset('tidak-ada@klinik.id');
  perform public.request_password_reset('');
  perform public.request_password_reset('c@test');
  perform pg_temp.must_fail('anon tidak membaca permintaan reset', $q$select * from public.password_reset_requests$q$);
  perform pg_temp.as_su();
  perform pg_temp.must_equal('permintaan reset hanya untuk akun aktif yang dikenal',
    (select count(*) from public.password_reset_requests), 1);
  execute 'set local role anon';
  perform public.request_password_reset('x@klinik.id');
  perform pg_temp.as_su();
  perform pg_temp.must_equal('permintaan beruntun tidak menggandakan', (select count(*) from public.password_reset_requests), 1);
  select id into req from public.password_reset_requests where user_id = x;

  perform pg_temp.as_user(a);
  perform pg_temp.must_equal('staff biasa tidak membaca permintaan reset', (select count(*) from public.password_reset_requests), 0);
  perform pg_temp.must_fail('staff biasa tidak bisa menolak permintaan', format($q$select public.reject_reset_request(%L)$q$, req));
  perform pg_temp.as_user(adm);
  perform pg_temp.must_equal('admin membaca permintaan reset', (select count(*) from public.password_reset_requests where status = 'pending'), 1);
  perform public.reject_reset_request(req);
  perform pg_temp.must_equal('permintaan ditolak tercatat',
    (select count(*) from public.password_reset_requests where id = req and status = 'rejected' and resolved_by = adm), 1);
  perform pg_temp.must_fail('permintaan yang sudah selesai tidak bisa ditolak lagi', format($q$select public.reject_reset_request(%L)$q$, req));
  perform pg_temp.as_su();
  update public.password_reset_requests set requested_at = now() - interval '1 hour' where id = req;
  execute 'set local role anon';
  perform public.request_password_reset('x@klinik.id');
  perform pg_temp.as_su();
  perform pg_temp.must_equal('permintaan baru bisa dibuat setelah yang lama selesai',
    (select count(*) from public.password_reset_requests where user_id = x and status = 'pending'), 1);

  perform pg_temp.as_user(x);
  g1 := public.create_group('Grup X', null, array[y, z]);
  dmx := public.create_direct_room(y);
  g3 := public.create_group('Grup Sendiri', null, '{}');
  insert into public.messages (room_id, sender_id, content) values
    (lobby, x, 'pesan lobby x'), (g1, x, 'pesan grup x'), (dmx, x, 'pesan pribadi x');
  perform pg_temp.as_user(y);
  g2 := public.create_group('Grup Y', null, array[x]);
  perform pg_temp.as_su();
  update public.room_members set member_role = 'admin' where room_id = g1 and user_id = z;
  delete from auth.users where id = x;
  perform pg_temp.must_equal('akun terhapus: profil ikut hilang', (select count(*) from public.profiles where id = x), 0);
  perform pg_temp.must_equal('pesan lobby tetap ada tanpa pengirim',
    (select count(*) from public.messages where content = 'pesan lobby x' and sender_id is null), 1);
  perform pg_temp.must_equal('pesan grup tetap ada tanpa pengirim',
    (select count(*) from public.messages where content = 'pesan grup x' and sender_id is null), 1);
  perform pg_temp.must_equal('pemilik grup berpindah ke admin grup',
    (select count(*) from public.room_members where room_id = g1 and user_id = z and member_role = 'owner'), 1);
  perform pg_temp.must_equal('grup tanpa anggota lain ikut terhapus', (select count(*) from public.rooms where id = g3), 0);
  perform pg_temp.must_equal('grup milik orang lain tetap utuh',
    (select count(*) from public.room_members where room_id = g2 and user_id = y and member_role = 'owner'), 1);
  perform pg_temp.must_equal('chat pribadi dengan akun terhapus ikut terhapus', (select count(*) from public.rooms where id = dmx), 0);
  perform pg_temp.must_equal('lobby tidak tersentuh', (select count(*) from public.rooms where type = 'lobby'), 1);
  perform pg_temp.must_equal('permintaan reset akun terhapus ikut hilang',
    (select count(*) from public.password_reset_requests where user_id = x), 0);
  perform pg_temp.as_user(y);
  perform pg_temp.must_equal('anggota masih membaca pesan dari pengirim terhapus',
    (select count(*) from public.messages where room_id = lobby and sender_id is null and content = 'pesan lobby x'), 1);
  perform pg_temp.must_fail('pesan tanpa pengirim tidak bisa disisipkan staff',
    format($q$insert into public.messages (room_id, sender_id, content) values (%L, null, 'palsu')$q$, lobby));

  perform pg_temp.as_user(a);
  perform pg_temp.must_fail('staff biasa tidak bisa menjalankan sinkronisasi',
    $q$select public.import_roster('[{"email":"y@klinik.id","full_name":"Y"}]'::jsonb, false, true)$q$);

  perform pg_temp.as_user(adm);
  rep := public.import_roster($j$[
    {"email":"y@klinik.id","staff_code":"TST-Y1","full_name":"Staff Y","role":"Dokter"},
    {"email":"z@klinik.id","staff_code":"TST-Z1","full_name":"Staff Z","role":"Apoteker"},
    {"email":"w@klinik.id","staff_code":"TST-W1","full_name":"Staff W","role":"Bidan"}
  ]$j$::jsonb, false, true);
  perform pg_temp.must_equal('sinkronisasi: 1 baru, 2 sama, 0 gagal',
    (rep->'counts'->>'baru')::bigint * 100 + (rep->'counts'->>'sama')::bigint * 10 + (rep->'counts'->>'gagal')::bigint, 120);
  perform pg_temp.must_equal('sinkronisasi: akun baru dihitung', (rep->'counts'->>'akun')::bigint, 1);
  perform pg_temp.must_equal('sinkronisasi: daftar akun baru berisi w',
    (select count(*) from jsonb_array_elements_text(rep->'create_emails') e where e = 'w@klinik.id'), 1);
  perform pg_temp.must_equal('sinkronisasi: admin tidak pernah masuk daftar hapus',
    (select count(*) from jsonb_array_elements(rep->'delete_users') u where (u->>'id')::uuid in (adm, d)), 0);
  perform pg_temp.must_equal('sinkronisasi: staff di luar file masuk daftar hapus',
    (select count(*) from jsonb_array_elements(rep->'delete_users') u where (u->>'id')::uuid in (a, c)), 2);
  perform pg_temp.must_equal('sinkronisasi: jumlah hapus = akun + roster tanpa akun',
    (rep->'counts'->>'hapus')::bigint, jsonb_array_length(rep->'delete_users') + 2);
  perform pg_temp.must_equal('sinkronisasi: pratinjau tidak menulis',
    (select count(*) from public.staff_roster where email in ('baru1@klinik.id', 'baru2@klinik.id', 'lama@klinik.id')), 3);

  rep := public.import_roster($j$[
    {"email":"y@klinik.id","staff_code":"TST-Y1","full_name":"Staff Y","role":"Dokter"},
    {"email":"salah","full_name":"Salah"}
  ]$j$::jsonb, false, true);
  perform pg_temp.must_equal('sinkronisasi ditahan bila ada baris gagal',
    (rep->'counts'->>'hapus')::bigint + jsonb_array_length(rep->'delete_users') + case when (rep->>'delete_blocked')::boolean then 1 else 0 end, 1);

  rep := public.import_roster('[{"email":"salah","full_name":"Salah"}]'::jsonb, false, true);
  perform pg_temp.must_equal('file tanpa baris valid tidak menghapus siapa pun',
    (rep->'counts'->>'hapus')::bigint, 0);

  rep := public.import_roster('[{"email":"y@klinik.id","staff_code":"TST-Y1","full_name":"Staff Y","role":"Dokter"}]'::jsonb, false, false);
  perform pg_temp.must_equal('tanpa sinkronisasi tidak ada penghapusan', (rep->'counts'->>'hapus')::bigint, 0);

  rep := public.import_roster('[{"email":"q@klinik.id","staff_code":"T-D","full_name":"Q"}]'::jsonb, false, true);
  perform pg_temp.must_equal('kode milik admin tetap dilindungi', (rep->'counts'->>'gagal')::bigint, 1);

  rep := public.import_roster($j$[
    {"email":"z@klinik.id","staff_code":"TST-Z1","full_name":"Staff Z","role":"Apoteker"},
    {"email":"n@klinik.id","staff_code":"TST-Y1","full_name":"Staff N","role":"Perawat"}
  ]$j$::jsonb, false, true);
  perform pg_temp.must_equal('kode staff milik akun yang akan dihapus boleh dipakai ulang',
    (rep->'counts'->>'gagal')::bigint * 10 + (rep->'counts'->>'baru')::bigint, 1);

  rep := public.import_roster($j$[
    {"email":"z@klinik.id","staff_code":"TST-Z1","full_name":"Staff Z","role":"Apoteker"},
    {"email":"n@klinik.id","staff_code":"TST-Y1","full_name":"Staff N","role":"Perawat"}
  ]$j$::jsonb, true, true);
  perform pg_temp.must_equal('apply sinkronisasi: roster hanya berisi isi file',
    (select count(*) from public.staff_roster), 2);
  perform pg_temp.must_equal('apply sinkronisasi: kode dipakai ulang tersimpan',
    (select count(*) from public.staff_roster where email = 'n@klinik.id' and staff_code = 'TST-Y1'), 1);
  perform pg_temp.must_equal('apply sinkronisasi: akun belum dihapus oleh SQL',
    (select count(*) from public.profiles where id in (a, y)), 2);

  perform pg_temp.as_su();
  execute 'set local role anon';
  perform pg_temp.must_fail('anon tidak bisa memanggil import_roster',
    $q$select public.import_roster('[]'::jsonb, false, true)$q$);
  perform pg_temp.as_su();

  raise notice 'PENGUJIAN TAHAP 5 LANJUTAN LULUS';
end $$;

rollback;
