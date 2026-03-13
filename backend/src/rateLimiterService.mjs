export class FixedWindowRateLimiter {
  constructor({ limit, windowMs, now = () => Date.now() } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.windowsByKey = new Map();
  }

  consume(key) {
    this.#pruneExpired();

    const nowMs = this.now();
    const current = this.windowsByKey.get(key);

    if (!current || current.resetAtMs <= nowMs) {
      const next = {
        count: 1,
        resetAtMs: nowMs + this.windowMs
      };
      this.windowsByKey.set(key, next);
      return this.#result(next);
    }

    current.count += 1;
    return this.#result(current);
  }

  #result(window) {
    const remaining = Math.max(0, this.limit - window.count);
    return {
      allowed: window.count <= this.limit,
      limit: this.limit,
      remaining,
      resetAtMs: window.resetAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAtMs - this.now()) / 1_000))
    };
  }

  #pruneExpired() {
    const nowMs = this.now();

    for (const [key, window] of this.windowsByKey.entries()) {
      if (window.resetAtMs <= nowMs) {
        this.windowsByKey.delete(key);
      }
    }
  }
}
