# Planning: foody-smtp (OTP via email)

## Tujuan
Service kecil untuk **membuat dan memverifikasi OTP**, dikirim ke email tujuan lewat
akun no-reply milik sendiri. Ini SMTP *client* (kirim lewat SMTP provider), bukan SMTP server sendiri.

## Alur
```
foody-app ──POST /otp/request {email}──▶ foody-smtp
                                          1. cek cooldown resend
                                          2. generate kode (crypto.randomInt)
                                          3. simpan HASH kode + expiry di store
                                          4. kirim email lewat SMTP no-reply
foody-app ──POST /otp/verify {email,code}▶ foody-smtp
                                          cek expiry, batas percobaan, bandingkan hash
                                          sukses → record dihapus (sekali pakai)
```

## Stack
- Node.js 24, **TypeScript dijalankan langsung** (type stripping, tanpa build step)
- `tsc --noEmit` hanya untuk typecheck (`npm run typecheck`)
- `nodemailer` (SMTP), `express` (HTTP), config lewat `.env` (`node --env-file`)

## Struktur modul
```
src/
├── config/env.ts          # baca + validasi env, satu-satunya tempat akses process.env
├── mail/
│   ├── mailer.ts          # interface Mailer { send(message) }
│   ├── smtp-mailer.ts     # implementasi Nodemailer
│   └── templates/otp.ts   # subject/text/html email OTP
├── otp/
│   ├── types.ts           # OtpRecord, OtpError + kode error
│   ├── generator.ts       # generate kode numerik aman
│   ├── hasher.ts          # HMAC-SHA256 + perbandingan timing-safe
│   ├── store.ts           # interface OtpStore { get, set, delete }
│   ├── memory-store.ts    # implementasi in-memory + cleanup expired
│   └── otp-service.ts     # request() & verify(), bergantung ke Mailer + OtpStore (injected)
├── http/
│   ├── app.ts             # susun express app dari dependency
│   ├── middleware.ts      # api key, rate limit per IP, cors
│   └── otp-routes.ts      # POST /otp/request, POST /otp/verify
├── server.ts              # composition root: rakit semua, listen
└── scripts/send-test.ts   # tes kirim OTP dari CLI
```
Aturan: `otp-service` tidak tahu soal express maupun nodemailer. Ganti store (Redis/DB)
atau mailer (API provider) cukup menulis implementasi baru dari interface-nya.

## Config (.env)
| Key | Default | Keterangan |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | - | akun no-reply |
| `MAIL_FROM` | - | `Foody <no-reply@domain.com>` |
| `OTP_SECRET` | - | kunci HMAC, string acak panjang |
| `OTP_LENGTH` | 6 | jumlah digit |
| `OTP_TTL_SECONDS` | 300 | masa berlaku |
| `OTP_MAX_ATTEMPTS` | 5 | salah input maksimal sebelum kode hangus |
| `OTP_RESEND_COOLDOWN_SECONDS` | 60 | jeda minimal minta kode lagi per email |
| `API_KEY` | - | proteksi endpoint |
| `PORT` | 3001 | |
| `ALLOWED_ORIGIN` | - | CORS |

## API
**`POST /otp/request`** `{ "email": "user@example.com", "purpose": "login" }`
- `200 { ok: true, expiresInSeconds }`
- `400` input tidak valid, `429` cooldown / rate limit, `502` SMTP gagal

**`POST /otp/verify`** `{ "email": "...", "code": "123456", "purpose": "login" }`
- `200 { ok: true }`
- `400` input tidak valid, `422 { code }` dengan `INVALID` / `EXPIRED` / `TOO_MANY_ATTEMPTS`

`purpose` opsional (default `default`) supaya OTP login tidak bisa dipakai untuk reset password.
`GET /health` → `200 { ok: true }`

## Keamanan
- Kode dibuat dengan `crypto.randomInt`, bukan `Math.random`
- Yang disimpan hanya HMAC(kode + email + purpose), bukan kode asli
- Sekali pakai, TTL, batas percobaan, cooldown resend per email
- Perbandingan hash `timingSafeEqual`
- Kalau email gagal terkirim, record dibatalkan (user tidak kena cooldown percuma)
- Rate limit per IP + header `x-api-key`, body dibatasi 100kb
- Kode OTP dan password SMTP tidak boleh masuk log

## Langkah implementasi
1. [x] Init project + install dependency
2. [x] Pindah ke TypeScript (tsconfig, tipe, script `typecheck`)
3. [x] `config/env.ts`
4. [x] Modul `mail/`
5. [x] Modul `otp/` + unit test (`node --test`)
6. [x] Modul `http/` + `server.ts`
7. [ ] Tes manual: `npm run send-test -- email@kamu.com`, lalu `curl` request → verify
8. [ ] Integrasi ke `foody-app`

## Batasan yang disadari
- Store in-memory: OTP hilang saat restart dan tidak bisa dipakai kalau service jalan lebih dari 1 instance. Untuk produksi multi-instance ganti `OtpStore` ke Redis.
- Kalau `/otp/request` dipanggil langsung dari browser, API key terlihat di frontend. Rate limit per IP + cooldown per email jadi pertahanan utama, atau panggil lewat backend.
- Gmail dibatasi ±500 email/hari.
