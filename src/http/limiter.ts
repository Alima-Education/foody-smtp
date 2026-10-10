export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export interface WindowLimiter {
  take(key: string): LimitResult;
}

export interface WindowLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

// Sliding window: simpan waktu tiap hit, hitung yang masih di dalam jendela.
export function createWindowLimiter({ limit, windowMs, now = Date.now }: WindowLimiterOptions): WindowLimiter {
  const hits = new Map<string, number[]>();

  const timer = setInterval(() => {
    const cutoff = now() - windowMs;
    for (const [key, times] of hits) {
      if (times.every((t) => t <= cutoff)) hits.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  timer.unref();

  return {
    take(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= limit) {
        const oldest = recent[0]!;
        hits.set(key, recent);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - t) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
