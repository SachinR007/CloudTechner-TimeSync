type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function assertRateLimit(key: string, options: { limit: number; windowMs: number; label: string }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > options.limit) {
    const retrySeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new Error(`${options.label} rate limit exceeded. Please try again in ${retrySeconds} seconds.`);
  }
}
