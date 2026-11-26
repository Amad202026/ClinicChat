# Setup Supabase

| File | Fungsi | Urutan |
|------|--------|--------|
| `schema.sql` | Tabel, fungsi, trigger, lobby, realtime | 1 |
| `policies.sql` | Row Level Security dan hak akses | 2 |
| `tests.sql` | Uji keamanan, data uji di-rollback | 3 |

`schema.sql` dan `policies.sql` aman dijalankan ulang di database yang sudah berisi data. Untuk pembaruan Tahap 5b jalankan keduanya lagi, lalu `tests.sql`, lalu deploy Edge Function (bagian 6).

## 1. Buat project

1. https://supabase.com, **New project**, nama ClinicChat, region Southeast Asia (Singapore), plan Free.
2. Simpan database password di password manager.

## 2. Pengaturan Auth

**Authentication → Sign In / Providers → Email**:

- **Allow new users to sign up**: nonaktif. Akun dibuat admin lewat Edge Function, yang tidak terpengaruh pengaturan ini.
- **Confirm email**: bebas, akun dibuat sudah terkonfirmasi.
- Panjang password minimal dan syarat karakter: password sementara berisi 12 huruf besar, huruf kecil, dan angka. Jika syarat password proyek meminta simbol, pembuatan akun akan gagal.

## 3. Database

**SQL Editor → New query**: jalankan seluruh `schema.sql`, lalu `policies.sql`. Hasil yang benar: `Success. No rows returned`.

Table Editor harus berisi `profiles`, `rooms`, `room_members`, `messages`, `message_reads`, semuanya RLS aktif. Tabel `rooms` berisi satu baris bertipe `lobby`.

## 4. Admin pertama dan roster

1. **Authentication → Users → Add user → Create new user**, isi email dan password admin, centang **Auto Confirm User**. Selama roster di database masih kosong, akun diterima apa adanya. Jika roster sudah berisi, tambahkan dulu email admin ke roster lewat SQL Editor:

```sql
insert into public.staff_roster (email, staff_code, full_name, role)
values ('email-admin@contoh.com', 'ADM-1', 'Nama Admin', 'Admin');
```

2. Jadikan akun itu admin:

```sql
update public.profiles
set is_admin = true
where email = 'email-admin@contoh.com';
```

3. Masuk lewat extension dan refresh halaman website. Buka tab Admin → Impor, pilih **Impor dari folder**, periksa pratinjau, lalu **Terapkan**.

Status admin hanya bisa diberikan lewat SQL Editor atau oleh admin lain di tab Admin.

## 5. Uji keamanan

Jalankan `tests.sql`. Hasil yang diharapkan: deretan `PASS: ...` dan `SEMUA PENGUJIAN LULUS`.

## 6. Edge Function staff-admin

Fungsi ini membuat akun dari Excel, menghapus akun, dan mereset password. Hanya admin aktif yang diterima, dan kunci rahasia dibaca dari environment Supabase di server.

1. Di folder `clinicchat`: `npm install`, lalu `npx supabase login`.
2. `npx supabase link --project-ref <project-ref>` (nilai ada di Project Settings → General).
3. `npx supabase functions deploy staff-admin`. `config.toml` sudah memuat `verify_jwt = false`; sesi dan hak admin diperiksa di dalam fungsi.
4. Uji: Edge Functions → staff-admin harus berstatus aktif. Setelah itu tab Admin → Impor bisa menerapkan data.

Tidak ada secret yang perlu diatur sendiri: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, dan `SUPABASE_SECRET_KEYS` disediakan Supabase untuk fungsi.

## 7. Kunci untuk extension

**Project Settings → API**: Project URL dan Publishable key masuk ke `config.js`. Kunci `secret` atau `service_role` tidak boleh dipakai di extension.

## Aturan akses

- Lobby: satu-satunya, semua staff aktif otomatis anggota.
- Grup: dibuat lewat `create_group()`; hanya anggota yang membaca dan mengirim; owner dan admin grup menambah anggota; admin hanya bisa mengeluarkan anggota biasa, owner bisa mengeluarkan siapa pun kecuali dirinya; peran admin hanya diberikan owner lewat `set_member_role()`; anggota selain owner bisa keluar sendiri.
- Chat pribadi: dibuat lewat `create_direct_room()`; satu pasangan satu room.
- Tag (`mentions`) disaring di database: hanya anggota room, bukan pengirim, tanpa duplikat.
- Pesan tidak bisa diubah atau dihapus staff.
- Admin aplikasi tidak otomatis membaca grup atau chat pribadi.
- Staff nonaktif (`is_active = false`) langsung kehilangan akses.
- Roster (`staff_roster`) hanya bisa dibaca admin dan hanya diubah lewat `import_roster()`. Status aktif dan admin hanya diubah lewat `admin_set_staff()`.
- Akun dibuat dan dihapus hanya oleh Edge Function `staff-admin` setelah memeriksa admin aktif. `import_roster(rows, apply, sync)` merencanakan dan mencatat roster; mode sinkronisasi tidak pernah memasukkan admin atau pemanggil ke daftar hapus dan menahan penghapusan bila ada baris gagal.
- Menghapus akun: pesan di lobby dan grup tetap ada dengan pengirim kosong (tampil Akun dihapus), chat pribadi akun itu ikut terhapus, kepemilikan grup berpindah ke admin grup atau anggota tertua, grup tanpa anggota lain ikut terhapus.
- Reset password: `request_password_reset(email)` bisa dipanggil tanpa login, hanya mencatat permintaan untuk akun aktif, dan selalu tampak berhasil. Hanya admin yang membaca, menolak, atau menyetujui permintaan. `profiles.must_change_password` hanya diubah server atau `finish_password_change()`.
- Foto profil: kolom `profiles.avatar` dibatasi format `data:image/(jpeg|png|webp);base64` maksimal 40.000 karakter dan hanya bisa diubah pemiliknya.

## Catatan pendaftaran

Form Daftar sudah tidak ada. Jika **Allow new users to sign up** tetap aktif, database tetap menolak email di luar roster dan mengisi nama, role, dan kode staff dari roster. Akun yang tidak seharusnya aktif dinonaktifkan di tab Admin atau lewat SQL:

```sql
update public.profiles set is_active = false where email = 'email-asing@contoh.com';
```

## Batasan Supabase Free (cek ulang di supabase.com/pricing)

- Tanpa SLA uptime dan tanpa backup otomatis yang bisa diandalkan.
- Project di-pause jika tidak aktif sekitar seminggu; restore manual lewat dashboard.
- Kuota database, bandwidth, pemanggilan Edge Function, dan koneksi realtime terbatas. Setiap tab website yang terbuka memakai satu koneksi realtime.
- Backup berkala sendiri, misalnya ekspor tabel atau `pg_dump`.

## Retensi pesan (usulan)

```sql
delete from public.messages where created_at < now() - interval '180 days';
```

Tentukan masa simpan bersama klinik dan backup sebelum menghapus.
