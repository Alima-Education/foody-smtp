import { loadConfig } from './config/env.ts';
import { createApp } from './http/app.ts';
import { SmtpMailer } from './mail/smtp-mailer.ts';
import { createHmacHasher } from './otp/hasher.ts';
import { MemoryOtpStore } from './otp/memory-store.ts';
import { OtpService } from './otp/otp-service.ts';

const config = loadConfig();

const mailer = new SmtpMailer(config);
const store = new MemoryOtpStore();
const otp = new OtpService({
  store,
  mailer,
  hasher: createHmacHasher(config.otp.secret),
  options: config.otp,
});

const server = createApp({ config, otp }).listen(config.http.port, () => {
  console.log(`foody-smtp jalan di port ${config.http.port}`);
});

// Cek SMTP di belakang supaya server (dan healthcheck) langsung siap, walau SMTP lambat/mati.
mailer
  .verify()
  .then(() => console.log('SMTP terhubung'))
  .catch((err) => {
    console.error('SMTP gagal terhubung:', err instanceof Error ? err.message : err);
    console.error('Cek SMTP_* di env. Server tetap jalan.');
  });

// Docker mengirim SIGTERM saat stop; tanpa handler ini proses menunggu 10 detik lalu dibunuh paksa.
const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
