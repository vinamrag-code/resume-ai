interface Bucket {
  minute: number[]
  dayStart: number
  dayCount: number
}

export interface LimitResult {
  ok: boolean
  /** Seconds until the caller may retry. */
  retryAfter: number
  reason?: 'minute' | 'day'
}

/** In-memory per-client limiter: N requests per rolling minute and M per rolling day. */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  constructor(
    private readonly perMinute: number,
    private readonly perDay: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): LimitResult {
    const t = this.now()
    const b = this.buckets.get(key) ?? { minute: [], dayStart: t, dayCount: 0 }
    b.minute = b.minute.filter((x) => t - x < 60_000)
    if (t - b.dayStart >= 86_400_000) {
      b.dayStart = t
      b.dayCount = 0
    }
    this.buckets.set(key, b)
    if (b.dayCount >= this.perDay) return { ok: false, reason: 'day', retryAfter: Math.ceil((b.dayStart + 86_400_000 - t) / 1000) }
    if (b.minute.length >= this.perMinute) return { ok: false, reason: 'minute', retryAfter: Math.max(1, Math.ceil((b.minute[0]! + 60_000 - t) / 1000)) }
    b.minute.push(t)
    b.dayCount++
    return { ok: true, retryAfter: 0 }
  }

  /** Drop idle clients so memory stays bounded. */
  sweep(): void {
    const t = this.now()
    for (const [k, b] of this.buckets) if (t - b.dayStart >= 86_400_000 && b.minute.every((x) => t - x >= 60_000)) this.buckets.delete(k)
  }
}
