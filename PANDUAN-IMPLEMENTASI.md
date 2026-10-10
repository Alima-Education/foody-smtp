# Panduan: Membuat Layanan OTP Email dengan TypeScript

Di panduan ini kamu membuat service kecil yang **membuat kode OTP, mengirimnya ke email pengguna lewat akun no-reply, lalu memverifikasinya**. Dikerjakan dengan Node.js + TypeScript dan disusun modular supaya mudah diganti-ganti bagiannya.

Estimasi waktu: 2–3 jam.

---

## 1. Yang akan kamu pelajari

- Bedanya SMTP *client* dan SMTP *server* (kita hanya butuh client)
- Kirim email dengan Nodemailer
- Membuat OTP yang aman: acak, di-hash, kedaluwarsa, sekali pakai, ada batas percobaan
- Memisahkan kode jadi modul dengan **interface** dan **dependency injection**
- Membuat REST API dengan Express dan melindunginya
- Menulis unit test tanpa perlu kirim email sungguhan

## 2. Persiapan

| Kebutuhan | Cek dengan |
|---|---|
| Node.js **24 atau lebih baru** | `node --version` |
| Akun email untuk no-reply | lihat bagian 3 |
| Terminal + editor (VS Code) | - |

> Node 24 bisa menjalankan file `.ts` langsung (*type stripping*), jadi **tidak ada langkah build**. TypeScript hanya dipakai untuk mengecek tipe.

## 3. Menyiapkan akun SMTP

SMTP adalah protokol untuk mengirim email. Kamu **tidak membuat server SMTP sendiri**. Kamu meminjam server milik penyedia email dan login dengan akun no-reply.

**Kalau memakai Gmail:**

1. Buat akun Gmail khusus, misalnya `namaapp.noreply@gmail.com`. Jangan pakai akun pribadi.
2. Aktifkan **Verifikasi 2 Langkah** di <https://myaccount.google.com/security>.
3. Buka <https://myaccount.google.com/apppasswords>, buat App Password, lalu salin 16 karakternya.
4. Nilai yang dipakai nanti:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=465`
   - `SMTP_USER=` alamat Gmail tadi
   - `SMTP_PASS=` App Password (**bukan** password login Gmail)

> Gmail membatasi sekitar 500 email per hari. Cukup untuk belajar, tidak untuk produksi besar.

Port 465 memakai TLS langsung. Port 587 memakai STARTTLS. Kode di bawah menangani keduanya.

## 4. Gambaran besar

```
Client ── POST /otp/request {email} ──▶ Service
                                         1. cek jeda minta ulang
                                         2. buat kode 6 digit
                                         3. simpan HASH kode + waktu kedaluwarsa
                                         4. kirim email via SMTP
Client ── POST /otp/verify {email,code} ▶ Service
                                         cek kedaluwarsa, batas percobaan, cocokkan hash
                                         berhasil → data dihapus (sekali pakai)
```

### Kenapa kodenya tidak disimpan apa adanya?

Kalau database bocor dan kode disimpan plaintext, penyerang bisa memakainya. Kita simpan **HMAC** dari kode (hash dengan kunci rahasia). Saat verifikasi, kode yang diketik user di-hash lagi lalu dibandingkan.

### Kenapa dipecah jadi banyak modul?

```
OtpService ──butuh──▶ Mailer (interface)   ◀── SmtpMailer (Nodemailer)
           ──butuh──▶ OtpStore (interface) ◀── MemoryOtpStore (nanti bisa Redis)
           ──butuh──▶ OtpHasher (interface)
```

`OtpService` hanya tahu *bentuk* dependency-nya, bukan implementasinya. Akibatnya:
- Ganti Gmail ke provider lain → tulis `Mailer` baru, `OtpService` tidak disentuh.
- Pindah penyimpanan ke Redis → tulis `OtpStore` baru.
- Saat test, `Mailer` diganti tiruan (fake) sehingga tidak ada email sungguhan yang terkirim.

## 5. Setup project

```bash
mkdir foody-smtp && cd foody-smtp
npm init -y
npm install express nodemailer
npm install -D typescript @types/node @types/express @types/nodemailer
mkdir -p src/config src/mail/templates src/otp src/http src/scripts
```

Ganti `package.json` dengan:

```json
{
  "name": "foody-smtp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --env-file=.env src/server.ts",
    "dev": "node --watch --env-file=.env src/server.ts",
    "send-test": "node --env-file=.env src/scripts/send-test.ts",
    "test": "node --test \"src/**/*.test.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^5.3.0",
    "nodemailer": "^10.1.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^26.6.5",
    "@types/nodemailer": "^8.0.2",
    "typescript": "^7.0.2"
  }
}
```

> Versi paket di `npm install` bisa lebih baru dari di atas, tidak masalah. Yang penting `"type": "module"` ada.

Buat `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Aturan yang muncul dari konfigurasi ini, dan sering bikin error di awal:

1. **Import harus menulis ekstensi `.ts`**: `import { x } from './x.ts'`.
2. **Import tipe wajib `import type`**: `import type { Foo } from './foo.ts'`.
3. **Tidak boleh `enum`** dan *parameter properties* (`constructor(private x: string)`). Node hanya menghapus tipe, tidak mengubah kode.

Buat `.gitignore`:

```
node_modules
.env
```

Buat `.env.example` (template, boleh di-commit):

```env
# SMTP akun no-reply
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=no-reply@domain.com
SMTP_PASS=isi-app-password
MAIL_FROM="Foody <no-reply@domain.com>"

# Service
PORT=3001
API_KEY=ganti-dengan-string-acak-panjang
ALLOWED_ORIGIN=http://localhost:5500

# OTP
OTP_SECRET=ganti-dengan-string-acak-panjang
OTP_LENGTH=6
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
```

Salin jadi `.env` lalu isi nilai aslinya. Buat string acak untuk `API_KEY` dan `OTP_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Jangan pernah commit `.env`.** File itu berisi password. Kalau terlanjur ter-commit, anggap password bocor dan buat ulang.

---

## 6. Langkah 1: Config (`src/config/env.ts`)

Semua akses `process.env` dikumpulkan di satu file. Env yang kurang ketahuan **saat start**, bukan saat error aneh di tengah jalan.

```ts
export interface Config {
  smtp: { host: string; port: number; user: string; pass: string };
  mailFrom: string;
  otp: {
    secret: string;
    length: number;
    ttlSeconds: number;
    maxAttempts: number;
    resendCooldownSeconds: number;
  };
  http: { port: number; apiKey: string; allowedOrigin: string | undefined };
}

type Source = Record<string, string | undefined>;

const required = (src: Source, key: string): string => {
  const value = src[key];
  if (!value) throw new Error(`Env ${key} belum diisi`);
  return value;
};

const int = (src: Source, key: string, fallback: number): number => {
  const raw = src[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Env ${key} harus bilangan bulat positif`);
  return n;
};

export function loadConfig(src: Source = process.env): Config {
  const otpLength = int(src, 'OTP_LENGTH', 6);
  if (otpLength < 4 || otpLength > 10) throw new Error('Env OTP_LENGTH harus antara 4 dan 10');

  return {
    smtp: {
      host: required(src, 'SMTP_HOST'),
      port: int(src, 'SMTP_PORT', 465),
      user: required(src, 'SMTP_USER'),
      pass: required(src, 'SMTP_PASS'),
    },
    mailFrom: required(src, 'MAIL_FROM'),
    otp: {
      secret: required(src, 'OTP_SECRET'),
      length: otpLength,
      ttlSeconds: int(src, 'OTP_TTL_SECONDS', 300),
      maxAttempts: int(src, 'OTP_MAX_ATTEMPTS', 5),
      resendCooldownSeconds: int(src, 'OTP_RESEND_COOLDOWN_SECONDS', 60),
    },
    http: {
      port: int(src, 'PORT', 3001),
      apiKey: required(src, 'API_KEY'),
      allowedOrigin: src.ALLOWED_ORIGIN || undefined,
    },
  };
}
```

**Catatan:** `loadConfig` menerima `src` sebagai parameter (default `process.env`), jadi gampang dites dengan objek biasa.

## 7. Langkah 2: Modul mail (`src/mail/`)

### `mailer.ts`: kontraknya

```ts
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
```

Hanya satu method. Segala hal tentang SMTP disembunyikan di baliknya.

### `smtp-mailer.ts`: implementasi dengan Nodemailer

```ts
import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../config/env.ts';
import type { Mailer, MailMessage } from './mailer.ts';

export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: Pick<Config, 'smtp' | 'mailFrom'>) {
    const { host, port, user, pass } = config.smtp;
    this.from = config.mailFrom;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = TLS langsung, 587 = STARTTLS
      auth: { user, pass },
    });
  }

  verify(): Promise<true> {
    return this.transporter.verify();
  }

  async send({ to, subject, text, html }: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}
```

`verify()` mencoba login ke SMTP tanpa mengirim apa pun. Berguna untuk cek kredensial saat start.

### `templates/otp.ts`: isi email

```ts
import type { MailMessage } from '../mailer.ts';

export interface OtpEmailParams {
  to: string;
  code: string;
  expiresInMinutes: number;
  appName?: string;
}

export function otpEmail({ to, code, expiresInMinutes, appName = 'Foody' }: OtpEmailParams): MailMessage {
  const note = `Kode berlaku ${expiresInMinutes} menit. Jangan bagikan kode ini ke siapa pun.`;
  return {
    to,
    subject: `${code} adalah kode verifikasi ${appName} kamu`,
    text: `Kode verifikasi ${appName} kamu: ${code}\n\n${note}\nAbaikan email ini kalau kamu tidak memintanya.`,
    html: `<div style="font-family:sans-serif;max-width:420px">
  <p>Kode verifikasi ${appName} kamu:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
  <p style="color:#555">${note}</p>
  <p style="color:#999;font-size:12px">Abaikan email ini kalau kamu tidak memintanya.</p>
</div>`,
  };
}
```

Selalu kirim versi `text` **dan** `html`. Beberapa klien email menampilkan teks saja, dan versi teks juga mengurangi kemungkinan masuk spam.

## 8. Langkah 3: Modul OTP (`src/otp/`)

### `types.ts`: record dan error

```ts
export interface OtpRecord {
  hash: string;
  expiresAt: number; // epoch ms
  sentAt: number; // epoch ms, untuk jeda minta ulang
  attempts: number;
}

export type OtpErrorCode = 'COOLDOWN' | 'INVALID' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS';

export class OtpError extends Error {
  readonly code: OtpErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: OtpErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'OtpError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
```

Error bertipe (`OtpError` dengan `code`) memungkinkan layer HTTP membedakan "kode salah" dari "SMTP mati".

### `generator.ts`: kode acak yang aman

```ts
import { randomInt } from 'node:crypto';

export function generateCode(length: number): string {
  return String(randomInt(0, 10 ** length)).padStart(length, '0');
}
```

> **Jangan pakai `Math.random()`** untuk OTP. Hasilnya bisa ditebak. `crypto.randomInt` memakai sumber acak yang aman. `padStart` menjaga kode `000123` tetap 6 digit.

### `hasher.ts`: HMAC

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface OtpHasher {
  hash(identity: string, code: string): string;
  matches(identity: string, code: string, expectedHash: string): boolean;
}

export function createHmacHasher(secret: string): OtpHasher {
  const hash = (identity: string, code: string) =>
    createHmac('sha256', secret).update(`${identity}\n${code}`).digest('hex');

  return {
    hash,
    matches(identity, code, expectedHash) {
      const a = Buffer.from(hash(identity, code));
      const b = Buffer.from(expectedHash);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}
```

Dua hal penting:
- `identity` (email + purpose) ikut di-hash, jadi kode milik satu orang tidak bisa dipakai untuk orang lain.
- `timingSafeEqual` membandingkan dalam waktu konstan. Perbandingan biasa (`===`) berhenti di karakter pertama yang beda, dan selisih waktunya bisa dimanfaatkan penyerang.

### `store.ts` dan `memory-store.ts`: penyimpanan

```ts
// store.ts
import type { OtpRecord } from './types.ts';

export interface OtpStore {
  get(key: string): Promise<OtpRecord | undefined>;
  set(key: string, record: OtpRecord): Promise<void>;
  delete(key: string): Promise<void>;
}
```

```ts
// memory-store.ts
import type { OtpStore } from './store.ts';
import type { OtpRecord } from './types.ts';

export class MemoryOtpStore implements OtpStore {
  private readonly records = new Map<string, OtpRecord>();
  private readonly timer: NodeJS.Timeout;

  constructor(cleanupIntervalMs = 60_000) {
    this.timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    this.timer.unref(); // jangan menahan proses tetap hidup
  }

  async get(key: string) {
    return this.records.get(key);
  }

  async set(key: string, record: OtpRecord) {
    this.records.set(key, record);
  }

  async delete(key: string) {
    this.records.delete(key);
  }

  close() {
    clearInterval(this.timer);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(key);
    }
  }
}
```

Method-nya `async` walaupun isinya sinkron, supaya bentuknya sama dengan store sungguhan (Redis/database) yang memang asinkron.

### `otp-service.ts`: inti logika

```ts
import type { Mailer } from '../mail/mailer.ts';
import { otpEmail } from '../mail/templates/otp.ts';
import { generateCode } from './generator.ts';
import type { OtpHasher } from './hasher.ts';
import type { OtpStore } from './store.ts';
import { OtpError } from './types.ts';

export interface OtpServiceOptions {
  length: number;
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  appName?: string;
}

export interface OtpServiceDeps {
  store: OtpStore;
  mailer: Mailer;
  hasher: OtpHasher;
  options: OtpServiceOptions;
  now?: () => number;
}

export class OtpService {
  private readonly store: OtpStore;
  private readonly mailer: Mailer;
  private readonly hasher: OtpHasher;
  private readonly options: OtpServiceOptions;
  private readonly now: () => number;

  constructor({ store, mailer, hasher, options, now = Date.now }: OtpServiceDeps) {
    this.store = store;
    this.mailer = mailer;
    this.hasher = hasher;
    this.options = options;
    this.now = now;
  }

  async request(email: string, purpose = 'default'): Promise<{ expiresInSeconds: number }> {
    const { key, identity, normalized } = this.identify(email, purpose);
    const { ttlSeconds, resendCooldownSeconds, length, appName } = this.options;
    const now = this.now();

    const existing = await this.store.get(key);
    if (existing) {
      const waitMs = existing.sentAt + resendCooldownSeconds * 1000 - now;
      if (waitMs > 0) {
        throw new OtpError('COOLDOWN', 'Tunggu sebelum meminta kode lagi', Math.ceil(waitMs / 1000));
      }
    }

    const code = generateCode(length);
    await this.store.set(key, {
      hash: this.hasher.hash(identity, code),
      expiresAt: now + ttlSeconds * 1000,
      sentAt: now,
      attempts: 0,
    });

    try {
      await this.mailer.send(otpEmail({ to: normalized, code, expiresInMinutes: Math.ceil(ttlSeconds / 60), appName }));
    } catch (err) {
      // email gagal: batalkan supaya user tidak kena jeda untuk kode yang tidak pernah sampai
      if (existing) await this.store.set(key, existing);
      else await this.store.delete(key);
      throw err;
    }

    return { expiresInSeconds: ttlSeconds };
  }

  async verify(email: string, code: string, purpose = 'default'): Promise<void> {
    const { key, identity } = this.identify(email, purpose);
    const record = await this.store.get(key);

    if (!record || record.expiresAt <= this.now()) {
      if (record) await this.store.delete(key);
      throw new OtpError('EXPIRED', 'Kode kedaluwarsa atau tidak ditemukan');
    }

    if (this.hasher.matches(identity, code, record.hash)) {
      await this.store.delete(key); // sekali pakai
      return;
    }

    const attempts = record.attempts + 1;
    if (attempts >= this.options.maxAttempts) {
      await this.store.delete(key);
      throw new OtpError('TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan, minta kode baru');
    }
    await this.store.set(key, { ...record, attempts });
    throw new OtpError('INVALID', 'Kode salah');
  }

  private identify(email: string, purpose: string) {
    const normalized = email.trim().toLowerCase();
    const identity = `${normalized}|${purpose}`;
    return { key: `otp:${identity}`, identity, normalized };
  }
}
```

Hal yang perlu kamu pahami dari file ini:

| Bagian | Alasan |
|---|---|
| Dependency masuk lewat constructor | Bisa diganti saat test (dependency injection) |
| `now` bisa disuntik | Test bisa "memajukan jam" tanpa menunggu 5 menit sungguhan |
| Email di-`toLowerCase` | `A@x.com` dan `a@x.com` dianggap orang yang sama |
| `purpose` ikut di key | OTP login tidak bisa dipakai untuk reset password |
| `try/catch` saat kirim email | Kalau SMTP gagal, state dikembalikan seperti semula |
| Hapus record setelah berhasil | Kode sekali pakai, tidak bisa dipakai ulang |
| Hapus record setelah batas percobaan | Mencegah brute force (kode 6 digit cuma 1 juta kemungkinan) |

## 9. Langkah 4: Unit test (`src/otp/otp-service.test.ts`)

Test ini memakai `FakeMailer` yang cuma menyimpan email di array, sehingga tidak butuh internet atau akun SMTP.

```ts
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { Mailer, MailMessage } from '../mail/mailer.ts';
import { createHmacHasher } from './hasher.ts';
import { MemoryOtpStore } from './memory-store.ts';
import { OtpService } from './otp-service.ts';
import { OtpError } from './types.ts';

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  fail = false;
  async send(m: MailMessage) {
    if (this.fail) throw new Error('smtp down');
    this.sent.push(m);
  }
  lastCode() {
    return this.sent.at(-1)!.text.match(/\d{6}/)![0];
  }
}

const rejectsWith = async (p: Promise<unknown>, code: string) => {
  await assert.rejects(p, (e) => e instanceof OtpError && e.code === code);
};

describe('OtpService', () => {
  let mailer: FakeMailer;
  let store: MemoryOtpStore;
  let clock: number;
  let otp: OtpService;

  beforeEach(() => {
    mailer = new FakeMailer();
    store = new MemoryOtpStore();
    store.close();
    clock = 1_000_000;
    otp = new OtpService({
      store,
      mailer,
      hasher: createHmacHasher('secret'),
      options: { length: 6, ttlSeconds: 300, maxAttempts: 3, resendCooldownSeconds: 60 },
      now: () => clock,
    });
  });

  it('kode benar lolos sekali, pemakaian kedua gagal', async () => {
    await otp.request('A@x.com');
    const code = mailer.lastCode();
    await otp.verify('a@x.com', code);
    await rejectsWith(otp.verify('a@x.com', code), 'EXPIRED');
  });

  it('kode salah menaikkan percobaan lalu hangus setelah batas', async () => {
    await otp.request('a@x.com');
    await rejectsWith(otp.verify('a@x.com', '000000'), 'INVALID');
    await rejectsWith(otp.verify('a@x.com', '000000'), 'INVALID');
    await rejectsWith(otp.verify('a@x.com', '000000'), 'TOO_MANY_ATTEMPTS');
    await rejectsWith(otp.verify('a@x.com', mailer.lastCode()), 'EXPIRED');
  });

  it('kedaluwarsa setelah TTL', async () => {
    await otp.request('a@x.com');
    clock += 301_000;
    await rejectsWith(otp.verify('a@x.com', mailer.lastCode()), 'EXPIRED');
  });

  it('jeda minta ulang, lalu boleh setelah lewat', async () => {
    await otp.request('a@x.com');
    await rejectsWith(otp.request('a@x.com'), 'COOLDOWN');
    clock += 61_000;
    await otp.request('a@x.com');
    assert.equal(mailer.sent.length, 2);
  });

  it('purpose berbeda tidak saling berlaku', async () => {
    await otp.request('a@x.com', 'login');
    await rejectsWith(otp.verify('a@x.com', mailer.lastCode(), 'reset'), 'EXPIRED');
  });

  it('email gagal terkirim: tidak kena jeda', async () => {
    mailer.fail = true;
    await assert.rejects(otp.request('a@x.com'), /smtp down/);
    mailer.fail = false;
    await otp.request('a@x.com');
    assert.equal(mailer.sent.length, 1);
  });
});
```

Jalankan:

```bash
npm test
```

Harusnya 6 test lolos. Perhatikan test "kedaluwarsa": jam diganti `clock += 301_000`, tidak ada `sleep` 5 menit.

## 10. Langkah 5: Layer HTTP (`src/http/`)

### `middleware.ts`

```ts
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const cors = (allowedOrigin: string | undefined): RequestHandler => (req, res, next) => {
  if (allowedOrigin) {
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Access-Control-Allow-Headers', 'content-type, x-api-key');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

export const apiKeyAuth = (apiKey: string): RequestHandler => {
  const expected = Buffer.from(apiKey);
  return (req: Request, res: Response, next: NextFunction) => {
    const given = Buffer.from(req.get('x-api-key') ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.status(401).json({ ok: false, error: 'API key salah' });
      return;
    }
    next();
  };
};

export const rateLimit = (maxPerMinute: number): RequestHandler => {
  const hits = new Map<string, number[]>();
  const timer = setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [ip, times] of hits) {
      if (times.every((t) => t < cutoff)) hits.delete(ip);
    }
  }, 60_000);
  timer.unref();

  return (req, res, next) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= maxPerMinute) {
      res.status(429).json({ ok: false, error: 'Terlalu banyak request' });
      return;
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
};
```

### `otp-routes.ts`

```ts
import { Router } from 'express';
import type { OtpService } from '../otp/otp-service.ts';
import { OtpError } from '../otp/types.ts';

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const PURPOSE_RE = /^[a-z0-9_-]{1,32}$/;

const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
const isPurpose = (v: unknown): v is string => typeof v === 'string' && PURPOSE_RE.test(v);

export function otpRoutes(otp: OtpService, codeLength: number): Router {
  const router = Router();
  const codeRe = new RegExp(`^\\d{${codeLength}}$`);

  router.post('/request', async (req, res) => {
    const { email, purpose = 'default' } = req.body ?? {};
    if (!isEmail(email)) {
      res.status(400).json({ ok: false, error: '"email" tidak valid' });
      return;
    }
    if (!isPurpose(purpose)) {
      res.status(400).json({ ok: false, error: '"purpose" tidak valid' });
      return;
    }

    try {
      const { expiresInSeconds } = await otp.request(email, purpose);
      res.json({ ok: true, expiresInSeconds });
    } catch (err) {
      if (err instanceof OtpError && err.code === 'COOLDOWN') {
        res.set('Retry-After', String(err.retryAfterSeconds));
        res.status(429).json({ ok: false, code: err.code, error: err.message, retryAfterSeconds: err.retryAfterSeconds });
        return;
      }
      console.error('Gagal kirim OTP:', err instanceof Error ? err.message : err);
      res.status(502).json({ ok: false, error: 'Gagal mengirim email' });
    }
  });

  router.post('/verify', async (req, res) => {
    const { email, code, purpose = 'default' } = req.body ?? {};
    if (!isEmail(email)) {
      res.status(400).json({ ok: false, error: '"email" tidak valid' });
      return;
    }
    if (typeof code !== 'string' || !codeRe.test(code)) {
      res.status(400).json({ ok: false, error: `"code" harus ${codeLength} digit` });
      return;
    }
    if (!isPurpose(purpose)) {
      res.status(400).json({ ok: false, error: '"purpose" tidak valid' });
      return;
    }

    try {
      await otp.verify(email, code, purpose);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof OtpError) {
        res.status(422).json({ ok: false, code: err.code, error: err.message });
        return;
      }
      console.error('Gagal verifikasi OTP:', err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, error: 'Terjadi kesalahan' });
    }
  });

  return router;
}
```

> **Jangan pernah `console.log` kode OTP atau password SMTP.** Log sering tersimpan dan dibaca banyak orang. Lihat bagaimana `catch` di atas hanya mencatat `err.message`.

**Kenapa kode status berbeda-beda?**

| Status | Arti |
|---|---|
| `400` | Input dari client salah bentuk |
| `401` | API key salah/tidak ada |
| `422` | Input benar bentuknya, tapi kode salah/kedaluwarsa |
| `429` | Terlalu sering (jeda atau rate limit) |
| `502` | Server kita sehat, tapi SMTP di belakangnya gagal |

### `app.ts`

```ts
import express from 'express';
import type { Config } from '../config/env.ts';
import type { OtpService } from '../otp/otp-service.ts';
import { apiKeyAuth, cors, rateLimit } from './middleware.ts';
import { otpRoutes } from './otp-routes.ts';

export interface AppDeps {
  config: Config;
  otp: OtpService;
}

export function createApp({ config, otp }: AppDeps) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(cors(config.http.allowedOrigin));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/otp', rateLimit(20), apiKeyAuth(config.http.apiKey), otpRoutes(otp, config.otp.length));

  return app;
}
```

Urutan middleware penting: rate limit dulu, baru cek API key, baru route.

## 11. Langkah 6: Merakit semuanya (`src/server.ts`)

Ini satu-satunya tempat yang tahu implementasi konkret mana yang dipakai (*composition root*).

```ts
import { loadConfig } from './config/env.ts';
import { createApp } from './http/app.ts';
import { SmtpMailer } from './mail/smtp-mailer.ts';
import { createHmacHasher } from './otp/hasher.ts';
import { MemoryOtpStore } from './otp/memory-store.ts';
import { OtpService } from './otp/otp-service.ts';

const config = loadConfig();

const mailer = new SmtpMailer(config);
const otp = new OtpService({
  store: new MemoryOtpStore(),
  mailer,
  hasher: createHmacHasher(config.otp.secret),
  options: config.otp,
});

try {
  await mailer.verify();
  console.log('SMTP terhubung');
} catch (err) {
  console.error('SMTP gagal terhubung:', err instanceof Error ? err.message : err);
  console.error('Cek SMTP_* di .env. Server tetap jalan.');
}

createApp({ config, otp }).listen(config.http.port, () => {
  console.log(`foody-smtp jalan di http://localhost:${config.http.port}`);
});
```

Dan script untuk tes cepat dari terminal, `src/scripts/send-test.ts`:

```ts
import { loadConfig } from '../config/env.ts';
import { SmtpMailer } from '../mail/smtp-mailer.ts';
import { createHmacHasher } from '../otp/hasher.ts';
import { MemoryOtpStore } from '../otp/memory-store.ts';
import { OtpService } from '../otp/otp-service.ts';

const to = process.argv[2];
if (!to) {
  console.error('Pakai: npm run send-test -- email@tujuan.com');
  process.exit(1);
}

const config = loadConfig();
const mailer = new SmtpMailer(config);
const store = new MemoryOtpStore();
const otp = new OtpService({ store, mailer, hasher: createHmacHasher(config.otp.secret), options: config.otp });

await mailer.verify();
const { expiresInSeconds } = await otp.request(to, 'test');
console.log(`OTP terkirim ke ${to}, berlaku ${expiresInSeconds} detik`);
store.close();
```

---

## 12. Menjalankan dan menguji

```bash
npm run typecheck     # harus tanpa error
npm test              # 6 test lolos
npm run send-test -- emailkamu@gmail.com   # cek inbox kamu (dan folder spam)
npm start
```

Tes API dengan `curl` (ganti `KEY` dengan `API_KEY` dari `.env`):

```bash
KEY=isi_api_key_kamu

# 1. Minta OTP
curl -X POST localhost:3001/otp/request \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"email":"emailkamu@gmail.com","purpose":"login"}'

# 2. Verifikasi dengan kode dari email
curl -X POST localhost:3001/otp/verify \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"email":"emailkamu@gmail.com","code":"123456","purpose":"login"}'
```

**Checklist yang harus kamu coba sendiri:**

- [ ] Minta OTP, kode masuk ke inbox
- [ ] Verifikasi dengan kode benar → `200`
- [ ] Pakai kode yang sama lagi → `422 EXPIRED` (sekali pakai)
- [ ] Salah memasukkan kode 5 kali → `TOO_MANY_ATTEMPTS`
- [ ] Minta OTP 2× berturut-turut → `429` di request kedua
- [ ] Tanpa header `x-api-key` → `401`
- [ ] Email tanpa `@` → `400`

## 13. Troubleshooting

| Gejala | Penyebab umum |
|---|---|
| `Invalid login: 535 ... Username and Password not accepted` | Pakai password biasa, bukan App Password; atau 2FA belum aktif |
| `Env XXX belum diisi` | `.env` belum dibuat, atau namanya typo |
| `ERR_MODULE_NOT_FOUND` / `Cannot find module './x'` | Lupa menulis ekstensi `.ts` di import |
| `SyntaxError: ... requires 'import type'` | Mengimpor tipe tanpa `import type` |
| `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | Memakai `enum` atau parameter properties |
| `ETIMEDOUT` / `ECONNREFUSED` ke SMTP | Jaringan/ISP memblokir port 465/587; coba port lain atau jaringan lain |
| Email masuk spam | Normal untuk akun Gmail baru; tandai "bukan spam" |
| Test tidak berhenti | Ada `setInterval` yang belum di-`close()` |

## 14. Batasan (dan tugas lanjutan)

Implementasi ini sengaja sederhana. Sebelum dipakai sungguhan, ketahui batasannya:

1. **Store in-memory**: OTP hilang saat server restart, dan tidak jalan kalau ada lebih dari satu instance.
2. **Rate limit in-memory per IP**: sama, hilang saat restart. Di balik reverse proxy, atur `app.set('trust proxy', ...)` supaya `req.ip` benar.
3. **API key di browser**: kalau frontend memanggil langsung, key kelihatan oleh siapa saja. Idealnya yang memanggil adalah backend.
4. **Tidak ada pembatasan per-email global**: penyerang bisa meminta OTP ke banyak alamat berbeda dari banyak IP.

### Tugas latihan

Urut dari mudah ke sulit:

1. **Mudah:** Tambahkan field `appName` ke config (`APP_NAME`) dan teruskan ke `OtpService` supaya nama di email bisa diganti lewat `.env`.
2. **Mudah:** Tambahkan test untuk `generateCode` (panjang selalu sesuai, hanya digit, `padStart` bekerja).
3. **Sedang:** Tulis test untuk `loadConfig` (env hilang → error, `OTP_LENGTH=2` → error). Petunjuk: parameter `src`.
4. **Sedang:** Buat template email OTP versi bahasa Inggris dan pilih lewat parameter `locale`.
5. **Sedang:** Ganti `MemoryOtpStore` dengan `RedisOtpStore` (paket `ioredis`) yang memakai `SET key value EX ttl`. Kalau modularnya benar, **hanya `server.ts` dan file baru** yang berubah.
6. **Sulit:** Tambahkan `Mailer` kedua (misal lewat API Resend/Brevo) lalu buat `FallbackMailer` yang mencoba mailer utama dan jatuh ke mailer cadangan jika gagal.
7. **Sulit:** Tambahkan batas global: maksimal N permintaan OTP per email per jam, di luar jeda 60 detik.

## 15. Rangkuman konsep

| Konsep | Di mana |
|---|---|
| Interface sebagai kontrak | `Mailer`, `OtpStore`, `OtpHasher` |
| Dependency injection | constructor `OtpService`, `createApp` |
| Composition root | `server.ts` |
| Fail fast | `loadConfig` |
| Hash, bukan plaintext | `hasher.ts` |
| Timing-safe compare | `hasher.ts`, `middleware.ts` |
| Defense in depth | rate limit + API key + jeda + batas percobaan + TTL |
| Testability | `now` dan `Mailer` bisa disuntik |
