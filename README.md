# AI Studio Konten

Versi uji untuk bikin konten jualan: foto produk, video bebas, video affiliate, dan video iklan. Jalan di Cloudflare (Worker + database D1 + penyimpanan R2). Kunci xAI tidak pernah dikirim ke browser.

Bahasa layarnya santai, bahasa Indonesia. Akun utama (master) tidak dipotong saldo. Akun lain pakai dompet kredit.

## Coba di komputer sendiri

Perlu Node.js 22 atau yang lebih baru.

1. Buka folder proyek ini di terminal.
2. Pasang paketnya:

```bash
npm install
```

3. Jalankan:

```bash
npm run dev
```

Perintah itu menyalin `.dev.vars.example` jadi `.dev.vars` kalau belum ada, menyiapkan database lokal, lalu membuka situs di `http://127.0.0.1:8787`.

4. Buka situs itu. Masuk dengan email dan password yang tertulis di `.dev.vars` (`MASTER_EMAIL` dan `MASTER_PASSWORD`).
5. Ganti `MASTER_PASSWORD` di `.dev.vars` sebelum orang lain bisa membuka komputer ini. Kalau password sudah terlanjur terpakai, hapus isi database lokal (folder `.wrangler`) lalu jalankan `npm run dev` lagi.

Selama `XAI_MOCK=1`, gambar dan videonya palsu (kotak warna dan video pendek). Semua alur tetap bisa dicoba tanpa kunci xAI dan tanpa biaya.

Tes otomatis:

```bash
npm test
```

## Harga di versi ini

Yang dipotong dari dompet = yang lebih besar antara harga menu dan biaya asli xAI × kurs × pengali.

- Pengali bawaan: 3
- Kurs bawaan: Rp16.000 per 1 dolar
- Foto produk: Rp5.000
- Video bebas: Rp57.000
- Video affiliate: Rp61.000
- Video iklan: Rp61.000
- Analisis produk dan caption: Rp0, tapi biaya aslinya tetap masuk hitungan batas harian

Akun master tidak dipotong. Kalau generate gagal, potongan dikembalikan. Batas belanja xAI bawaan $200 per hari (waktu Jakarta). Lewat $50 dan $100 ada catatan alarm. Semua angka ini bisa diubah di halaman Admin.

## Naik ke Cloudflare

Jangan lakukan ini sebelum kamu siap. Versi uji lokal tidak membuat apa pun di akun Cloudflare.

1. Pasang Wrangler dan masuk ke akun Cloudflare:

```bash
npx wrangler login
```

2. Buat database D1:

```bash
npx wrangler d1 create ai-studio-konten
```

Salin `database_id` yang muncul ke `wrangler.jsonc`, menggantikan `00000000-0000-4000-8000-000000000001`.

3. Buat ember penyimpanan R2:

```bash
npx wrangler r2 bucket create ai-studio-konten
```

4. Terapkan tabelnya ke database yang baru:

```bash
npx wrangler d1 migrations apply ai-studio-konten --remote
```

5. Simpan rahasia. Setiap perintah akan minta nilainya. Jangan tempel kunci di chat atau di file yang di-commit.

```bash
npx wrangler secret put XAI_API_KEY
npx wrangler secret put MASTER_EMAIL
npx wrangler secret put MASTER_PASSWORD
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put TURNSTILE_SITE_KEY
```

6. Di `wrangler.jsonc`, ubah `ENVIRONMENT` menjadi `production`. Jangan pasang `XAI_MOCK` dan jangan pasang `TURNSTILE_BYPASS` di production.
7. Di [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile), buat widget untuk domain situs ini. Site key yang aman untuk halaman masuk boleh disimpan sebagai secret `TURNSTILE_SITE_KEY` (bukan rahasia yang sama dengan secret key).
8. Deploy:

```bash
npx wrangler deploy
```

9. Buka alamat `*.workers.dev` yang muncul. Masuk dengan email dan password master. Bikin akun kasir dari halaman Admin kalau mau mencoba potong saldo.

Opsional, untuk alarm ke Telegram atau catatan email:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put ALERT_EMAIL
```

Kalau Telegram kosong, alarm hanya masuk log dan tabel peringatan di Admin.

## Yang belum disambungkan

- Pembayaran QRIS Midtrans. Rute webhook-nya ada dan mengecek tanda tangan, tapi mati sampai `MIDTRANS_ENABLED=1` dan kode panggilan Midtrans diisi.
- Pengiriman email alarm. Kalau `ALERT_EMAIL` diisi, isinya hanya dicatat, belum dikirim.
- Pendaftaran sendiri. Mati. Admin yang bikin akun.
- Bukan detektor wajah artis. Ada peringatan, centang izin, dan penolakan kalau teksnya minta wajah artis atau tokoh publik.
- Video sungguhan bisa lama. Kalau xAI belum selesai dalam satu permintaan, statusnya “sedang dibuat” dan halaman riwayat melanjutkan pengecekan.

## Model yang dipakai

- Gambar: `grok-imagine-image-quality` (bisa diganti di Admin ke `grok-imagine-image` atau `grok-imagine-image-2.0`)
- Video: selalu `grok-imagine-video-1.5`
- Teks naskah: `grok-4.3`
- Suara: `ara`, `rex`, `eve`, `sal`, `leo` lewat `POST /v1/tts`. Daftar lengkap suara ada di `GET /v1/tts/voices`.

Biaya xAI dicatat dari `usage.cost_in_usd_ticks` (10 miliar tick = 1 dolar).
