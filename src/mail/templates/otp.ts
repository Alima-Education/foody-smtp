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
