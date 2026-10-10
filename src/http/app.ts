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
