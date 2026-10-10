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
