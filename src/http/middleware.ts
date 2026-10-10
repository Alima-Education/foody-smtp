import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { WindowLimiter } from './limiter.ts';

export const cors = (allowedOrigins: string[]): RequestHandler => (req, res, next) => {
  const origin = req.get('origin');
  res.vary('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'content-type, x-api-key');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  next();
};

export const apiKeyAuth = (apiKey: string): RequestHandler => {
  const expected = Buffer.from(apiKey);
  return (req: Request, res: Response, next: NextFunction) => {
    const given = Buffer.from(req.get('x-api-key') ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.status(401).json({ ok: false, error: 'API key salah' });
      return;
    }
    next();
  };
};

export const rateLimitByIp = (limiter: WindowLimiter): RequestHandler => (req, res, next) => {
  const result = limiter.take(req.ip ?? 'unknown');
  if (!result.ok) {
    res.set('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({ ok: false, error: 'Terlalu banyak request', retryAfterSeconds: result.retryAfterSeconds });
    return;
  }
  next();
};
