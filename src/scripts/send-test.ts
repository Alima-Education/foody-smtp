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
