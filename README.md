# Absensi Mapel SD YPU

Project ini memakai Cloudflare Pages + D1.

## Perubahan utama
- Login hanya untuk 3 akun mapel: **PJOK**, **PAI 1**, dan **PAI 2**.
- Hak kelas otomatis:
  - PJOK: kelas 1A sampai 6B
  - PAI 1: kelas 1A sampai 3B
  - PAI 2: kelas 4A sampai 6B
- Absensi mapel disimpan di tabel baru `subject_attendance`, sehingga tidak bentrok dengan absensi wali kelas lama.
- Container kedua hanya berisi pilihan kelas, input tanggal, tombol Logout, Reset Data, dan Semua Hadir.
- Laporan cetak dan export Excel memakai format semester seperti file contoh: bulan dikelompokkan sesuai semester dan tanggal mengikuti data yang tersimpan di database.

## PIN awal
Semua akun memakai PIN default: `123456`.
PIN bisa diubah dari menu Options.

## Deploy
- Upload ke GitHub, lalu deploy ke Cloudflare Pages.
- Pastikan database D1 sudah dibinding sebagai `DB` sesuai `wrangler.toml`.
- Jalankan migration jika database baru. Jika database sudah lama, schema tambahan juga dibuat otomatis saat API dipanggil.
