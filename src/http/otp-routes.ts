import { Router } from 'express';
import type { OtpService } from '../otp/otp-service.ts';
import { OtpError } from '../otp/types.ts';
import type { WindowLimiter } from './limiter.ts';

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const PURPOSE_RE = /^[a-z0-9_-]{1,32}$/;

const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
const isPurpose = (v: unknown): v is string => typeof v === 'string' && PURPOSE_RE.test(v);

export interface OtpRoutesDeps {
  otp: OtpService;
  codeLength: number;
  emailLimiter: WindowLimiter; // batas permintaan OTP per email per jam
  dailyLimiter: WindowLimiter; // batas total email terkirim per hari (lindungi kuota SMTP)
}

export function otpRoutes({ otp, codeLength, emailLimiter, dailyLimiter }: OtpRoutesDeps): Router {
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

    const perEmail = emailLimiter.take(email.trim().toLowerCase());
    const daily = perEmail.ok ? dailyLimiter.take('all') : perEmail;
    if (!daily.ok) {
      res.set('Retry-After', String(daily.retryAfterSeconds));
      res.status(429).json({ ok: false, error: 'Batas permintaan kode tercapai, coba lagi nanti', retryAfterSeconds: daily.retryAfterSeconds });
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
