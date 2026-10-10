import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const cors = (allowedOrigin: string | undefined): RequestHandler => (req, res, next) => {
  if (allowedOrigin) {
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Access-Control-Allow-Headers', 'content-type, x-api-key');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
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

export const rateLimit = (maxPerMinute: number): RequestHandler => {
  const hits = new Map<string, number[]>();
  const timer = setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [ip, times] of hits) {
      if (times.every((t) => t < cutoff)) hits.delete(ip);
    }
  }, 60_000);
  timer.unref();

  return (req, res, next) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= maxPerMinute) {
      res.status(429).json({ ok: false, error: 'Terlalu banyak request' });
      return;
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
};
