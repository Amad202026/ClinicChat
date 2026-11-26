# ClinicChat

Chat internal staff klinik untuk Google Chrome (Manifest V3). Tampil sebagai tombol floating **CC** dengan panel Lobby, Groups, Personal, dan Profile.

## Status

| Tahap | Isi | Status |
|-------|-----|--------|
| 1 | Extension dan tombol floating | selesai |
| 2 | Supabase, database, RLS | selesai |
| 3 | Login dan Lobby realtime | selesai |
| 3b | Daftar mandiri dari Excel, tag @, notifikasi, animasi | selesai |
| 4 | Group chat dan chat pribadi | selesai |
| 5 | Roster staff di database, impor Excel, panel Admin | selesai |
| 5b | Impor otomatis (akun dibuat dan dihapus mengikuti Excel), hapus akun, reset password lewat persetujuan admin, foto profil | selesai |
| 6 | Unread permanen, read receipts, notifikasi lanjutan | selesai |
| 7 | Pengujian keamanan, navigasi website, dokumentasi akhir | selesai |

## Instalasi

1. Isi `config.js` dengan Project URL dan Publishable key Supabase.
2. Buka `chrome://extensions`, aktifkan Developer mode, klik **Load unpacked**, pilih folder ini.
3. Setelah mengganti file apa pun, klik reload pada ClinicChat lalu refresh halaman website.

Setup database ada di `supabase/SETUP.md`.

## Data staff (Excel)

Letakkan file `data/staff.xlsx` di folder extension, atau pilih file lain saat impor. Sheet pertama, baris pertama berisi judul kolom:

| staff_code | full_name | role | email |
|------------|-----------|------|-------|

Nama kolom lain yang dikenali: `nama`, `nama lengkap`, `jabatan`, `peran`, `posisi`, `kode`, `nip`, `surel`. Jangan simpan password di file ini. Email wajib karena menjadi nama login.

Excel adalah sumber data staff. Saat admin menerapkan impor:

- Setiap email baru di file mendapat akun otomatis dengan password sementara acak. Password tampil sekali di layar admin dan bisa diunduh sebagai XLSX. Staff wajib mengganti password saat login pertama.
- Staff yang sudah ada diperbarui (nama, role, kode).
- Akun staff biasa yang tidak ada lagi di file dihapus. Akun admin dan akun yang sedang dipakai tidak pernah dihapus oleh impor.
- Bila ada baris gagal, penghapusan ditunda dan hanya penambahan serta pembaruan yang berjalan.
- Form Daftar mandiri sudah dihapus dari layar login.

## Panel Admin

Tab Admin hanya muncul untuk akun admin. Semua tindakan diperiksa ulang di server.

- **Staff:** daftar akun dan entri roster yang belum punya akun, pencarian, menonaktifkan atau mengaktifkan, menjadikan atau mencabut admin, **Reset password**, **Hapus**. Admin tidak bisa mengubah atau menghapus akunnya sendiri, dan admin lain harus dicabut dulu sebelum dihapus.
- **Impor:** **Impor dari folder** atau **Pilih file…**. Pratinjau menampilkan baru, diubah, sama, gagal, dihapus, dan jumlah akun yang akan dibuat, lengkap dengan alasan dan nomor baris Excel. Bila ada akun yang akan dihapus, tombol Terapkan meminta klik dua kali.
- **Reset:** permintaan reset password dari layar login. **Setujui** membuat password sementara baru, **Tolak** menutup permintaan.
- Validasi: email, nama wajib, panjang kolom, email ganda dan kode staff ganda di file, kode staff yang dipakai orang lain. Maksimal 500 baris dan 2 MB per impor.
- Pembuatan dan penghapusan akun serta reset password dijalankan oleh Edge Function `staff-admin` (kunci rahasia hanya ada di server Supabase, bukan di extension).

## Lupa password

Di layar login, **Lupa password?** mengirim permintaan ke admin tanpa menunjukkan apakah email terdaftar. Setelah admin menyetujui, staff masuk dengan password sementara dari admin lalu diminta membuat password baru. Staff yang sudah masuk bisa mengganti password sendiri di Profile.

## Foto profil

Profile → **Ubah foto**. Gambar dipotong persegi, dikecilkan ke 128 px, dan disimpan sebagai JPEG kecil di kolom `profiles.avatar`. Foto tampil di Profile, pesan grup dan lobby, daftar staff, dan daftar anggota. Foto disimpan di cache extension dan hanya diunduh ulang bila berubah. Jika website menolak gambar `data:` lewat CSP, tampilan kembali ke huruf inisial.

## Tag dan notifikasi

- Ketik `@` di kolom pesan, pilih nama dengan panah dan Enter. Pesan yang menyebut seseorang disorot di layarnya.
- Notifikasi desktop mengikuti pilihan di Profile: Semua, Hanya @ saya, atau Mati. Klik notifikasi membuka panel.
- Badge angka muncul di tombol CC dan tab saat ada pesan belum dilihat, lengkap dengan status unread permanen dan read receipts.

## Grup dan chat pribadi

- Tab Groups: daftar grup yang saya ikuti, tombol **+ Buat**, badge belum dibaca per grup. Ikon **i** di ruang grup membuka info grup.
- Pemilik grup: mengubah nama dan deskripsi, menambah dan mengeluarkan anggota, menjadikan atau mencabut admin.
- Admin grup: mengubah nama dan deskripsi, menambah anggota, mengeluarkan anggota biasa.
- Anggota biasa: hanya membaca, menulis, dan keluar dari grup. Pemilik tidak bisa keluar.
- Tab Personal: daftar percakapan dan **+ Baru** untuk memilih staff. Satu pasangan staff hanya punya satu percakapan.
- Di grup dan chat pribadi, daftar `@` hanya menampilkan anggota ruang itu.
- Daftar diurutkan menurut pesan terakhir. Klik notifikasi atau toast membuka ruang yang tepat.

## Izin extension

- `storage`: sesi login, posisi tombol, pilihan notifikasi.
- `notifications`: notifikasi desktop.
- `host_permissions` dan `matches` diatur ke `http(s)://*/*` (dapat disesuaikan ke domain Assist spesifik pada produksi).

## Struktur

- `manifest.json`, `config.js`
- `background/service-worker.js`: membaca dan membuat XLSX, request ke Supabase, notifikasi desktop
- `content/content.js`: tombol, panel, posisi, badge
- `lib/client.js`: klien Supabase dan cache staff; `lib/supabase.js`, `lib/xlsx.mini.min.js`: library
- `ui/styles.js`: gaya dan animasi
- `ui/components/`: `login.js`, `password.js`, `chat-room.js`, `lobby.js`, `groups.js`, `private-chat.js`, `staff-picker.js`, `profile.js`, `admin.js`, `mentions.js`, `notifications.js`
- `data/staff.xlsx`
- `supabase/`: `schema.sql`, `policies.sql`, `tests.sql`, `SETUP.md`, `config.toml`, `functions/staff-admin/index.ts`