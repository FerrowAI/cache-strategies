/**
 * cache-strategies — LRU, LFU, and TTL cache implementations sharing one
 * interface, each with hit/miss/eviction stats.
 *
 * The previous LRUCache here had a real bug: `get()` never refreshed
 * recency, so it evicted by insertion order, not access order. This
 * implementation fixes that using the Map re-insertion pattern (delete +
 * set moves a key to the "most recent" end of Map's insertion-ordered
 * iteration).
 */

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
  stats(): CacheStats;
}

abstract class BaseCache<T> implements Cache<T> {
  protected hits = 0;
  protected misses = 0;
  protected evictions = 0;

  abstract get(key: string): T | undefined;
  abstract set(key: string, value: T): void;
  abstract has(key: string): boolean;
  abstract delete(key: string): boolean;
  abstract clear(): void;
  abstract get size(): number;

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, evictions: this.evictions, size: this.size };
  }
}

/** Least-Recently-Used cache. get() and set() both refresh an entry's recency. */
export class LRUCache<T> extends BaseCache<T> {
  private readonly maxSize: number;
  private readonly map = new Map<string, T>();

  constructor(options: { maxSize: number }) {
    super();
    if (options.maxSize <= 0) throw new Error('maxSize must be > 0');
    this.maxSize = options.maxSize;
  }

  get(key: string): T | undefined {
    if (!this.map.has(key)) {
      this.misses++;
      return undefined;
    }
    const value = this.map.get(key) as T;
    // Re-insert to move this key to the most-recently-used end.
    this.map.delete(key);
    this.map.set(key, value);
    this.hits++;
    return value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value as string;
      this.map.delete(oldestKey);
      this.evictions++;
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Least-Frequently-Used cache. O(1) get/set via frequency buckets (an LFU frequency list). */
export class LFUCache<T> extends BaseCache<T> {
  private readonly maxSize: number;
  private readonly values = new Map<string, T>();
  private readonly freq = new Map<string, number>();
  // freq -> insertion-ordered set of keys at that frequency (Map preserves insertion order)
  private readonly buckets = new Map<number, Set<string>>();
  private minFreq = 0;

  constructor(options: { maxSize: number }) {
    super();
    if (options.maxSize <= 0) throw new Error('maxSize must be > 0');
    this.maxSize = options.maxSize;
  }

  private touch(key: string): void {
    const f = this.freq.get(key) as number;
    const bucket = this.buckets.get(f);
    bucket?.delete(key);
    if (bucket && bucket.size === 0) {
      this.buckets.delete(f);
      if (this.minFreq === f) this.minFreq = f + 1;
    }
    const nf = f + 1;
    this.freq.set(key, nf);
    if (!this.buckets.has(nf)) this.buckets.set(nf, new Set());
    this.buckets.get(nf)!.add(key);
  }

  get(key: string): T | undefined {
    if (!this.values.has(key)) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.touch(key);
    return this.values.get(key);
  }

  set(key: string, value: T): void {
    if (this.values.has(key)) {
      this.values.set(key, value);
      this.touch(key);
      return;
    }

    if (this.values.size >= this.maxSize) {
      const bucket = this.buckets.get(this.minFreq);
      const evictKey = bucket ? (bucket.values().next().value as string) : undefined;
      if (evictKey !== undefined) {
        bucket!.delete(evictKey);
        if (bucket!.size === 0) this.buckets.delete(this.minFreq);
        this.values.delete(evictKey);
        this.freq.delete(evictKey);
        this.evictions++;
      }
    }

    this.values.set(key, value);
    this.freq.set(key, 1);
    if (!this.buckets.has(1)) this.buckets.set(1, new Set());
    this.buckets.get(1)!.add(key);
    this.minFreq = 1;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  delete(key: string): boolean {
    if (!this.values.has(key)) return false;
    const f = this.freq.get(key) as number;
    const bucket = this.buckets.get(f);
    bucket?.delete(key);
    if (bucket && bucket.size === 0) this.buckets.delete(f);
    this.freq.delete(key);
    return this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
    this.freq.clear();
    this.buckets.clear();
    this.minFreq = 0;
  }

  get size(): number {
    return this.values.size;
  }
}

interface TTLEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Time-To-Live cache. Expiry is checked lazily on get()/has() (no timer
 * needed), plus an optional background sweep timer for proactive cleanup
 * of never-read stale entries. The sweep timer is `.unref()`'d so it never
 * keeps a Node process alive by itself.
 */
export class TTLCache<T> extends BaseCache<T> {
  private readonly defaultTtlMs: number;
  private readonly map = new Map<string, TTLEntry<T>>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: { ttlMs: number; sweepIntervalMs?: number }) {
    super();
    if (options.ttlMs <= 0) throw new Error('ttlMs must be > 0');
    this.defaultTtlMs = options.ttlMs;
    if (options.sweepIntervalMs && options.sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), options.sweepIntervalMs);
      const maybeUnref = this.sweepTimer as unknown as { unref?: () => void };
      maybeUnref.unref?.();
    }
  }

  private isExpired(entry: TTLEntry<T>): boolean {
    return Date.now() >= entry.expiresAt;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.map.delete(key);
      this.evictions++;
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.map.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      this.evictions++;
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /** Proactively remove all expired entries. Called automatically by the sweep timer if configured. */
  sweep(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.map) {
      if (now >= entry.expiresAt) {
        this.map.delete(key);
        removed++;
      }
    }
    this.evictions += removed;
    return removed;
  }

  /** Stop the background sweep timer, if one was configured. */
  stopSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}

export default { LRUCache, LFUCache, TTLCache };
