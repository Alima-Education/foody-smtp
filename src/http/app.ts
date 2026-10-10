import express, { type ErrorRequestHandler } from 'express';
import type { Config } from '../config/env.ts';
import type { OtpService } from '../otp/otp-service.ts';
import { createWindowLimiter } from './limiter.ts';
import { apiKeyAuth, cors, rateLimitByIp, securityHeaders } from './middleware.ts';
import { otpRoutes } from './otp-routes.ts';

export interface AppDeps {
  config: Config;
  otp: OtpService;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function createApp({ config, otp }: AppDeps) {
  const { http, limits } = config;
  const app = express();

  app.disable('x-powered-by');
  if (http.trustProxy !== undefined) app.set('trust proxy', http.trustProxy);

  app.use(securityHeaders);
  app.use(express.json({ limit: '10kb' }));
  app.use(cors(http.allowedOrigins));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    '/otp',
    rateLimitByIp(createWindowLimiter({ limit: limits.ratePerMinutePerIp, windowMs: 60_000 })),
    apiKeyAuth(http.apiKey),
    otpRoutes({
      otp,
      codeLength: config.otp.length,
      emailLimiter: createWindowLimiter({ limit: limits.requestsPerEmailPerHour, windowMs: HOUR }),
      dailyLimiter: createWindowLimiter({ limit: limits.mailsPerDay, windowMs: DAY }),
    }),
  );

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint tidak ditemukan' });
  });

  // JSON rusak / body kebesaran: jawab ringkas, jangan bocorkan detail internal
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('Error tak terduga:', err instanceof Error ? err.message : err);
    res.status(status).json({ ok: false, error: status === 500 ? 'Terjadi kesalahan' : 'Request tidak valid' });
  };
  app.use(onError);

  return app;
}
