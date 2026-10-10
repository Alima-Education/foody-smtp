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
