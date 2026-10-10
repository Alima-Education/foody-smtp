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
