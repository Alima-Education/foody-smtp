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
  limits: {
    ratePerMinutePerIp: number;
    requestsPerEmailPerHour: number;
    mailsPerDay: number;
  };
  http: {
    port: number;
    apiKey: string;
    allowedOrigins: string[];
    trustProxy: number | undefined;
  };
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

const list = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

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
    limits: {
      ratePerMinutePerIp: int(src, 'RATE_LIMIT_PER_MINUTE', 20),
      requestsPerEmailPerHour: int(src, 'OTP_REQUESTS_PER_EMAIL_PER_HOUR', 5),
      mailsPerDay: int(src, 'MAIL_DAILY_LIMIT', 400), // Gmail ±500/hari
    },
    http: {
      port: int(src, 'PORT', 3001),
      apiKey: required(src, 'API_KEY'),
      // ALLOWED_ORIGIN (tunggal) tetap didukung supaya .env lama tidak rusak
      allowedOrigins: list(src.ALLOWED_ORIGINS ?? src.ALLOWED_ORIGIN),
      // jumlah proxy di depan app (Caddy/Nginx = 1). Kosong = tidak ada proxy.
      trustProxy: src.TRUST_PROXY ? int(src, 'TRUST_PROXY', 1) : undefined,
    },
  };
}
