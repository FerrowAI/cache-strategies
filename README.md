# cache-strategies

```sh
npm install @ferrow/cache-strategies
```
![CI](https://github.com/FerrowAI/cache-strategies/actions/workflows/ci.yml/badge.svg)

Three in-memory cache implementations for TypeScript/Node — `LRUCache`,
`LFUCache`, `TTLCache` — sharing one `Cache<T>` interface, each tracking
hits/misses/evictions. Zero runtime dependencies, no Redis or other
backing store.

An earlier version of `LRUCache` in this repo had a real bug: `get()`
never refreshed an entry's recency, so eviction was actually by insertion
order, not access order. This version fixes it — `get()` and `set()` both
move a key to the most-recently-used end via the Map delete+re-insert
pattern (Map iterates in insertion order, so re-inserting moves a key to
the end).

## Install

Copy `src/index.ts` into your project, or build this repo (`npm run build`)
and depend on the compiled `dist/`.

## Quickstart

```ts
import { LRUCache, LFUCache, TTLCache } from 'cache-strategies';

const lru = new LRUCache<string>({ maxSize: 100 });
lru.set('key', 'value');
lru.get('key'); // refreshes recency — 'key' won't be the next eviction target

const lfu = new LFUCache<string>({ maxSize: 100 });
// evicts the least-frequently-accessed entry when full

const ttl = new TTLCache<string>({ ttlMs: 60_000, sweepIntervalMs: 30_000 });
// entries expire lazily on get()/has(); sweepIntervalMs is optional
// proactive cleanup for entries that are set and never read again
```

## API

All three implement:

```ts
interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
  stats(): { hits: number; misses: number; evictions: number; size: number };
}
```

- **`LRUCache<T>({ maxSize })`** — evicts the least-recently-*used* entry
  (by both get and set) once `size > maxSize`.
- **`LFUCache<T>({ maxSize })`** — evicts the least-*frequently*-accessed
  entry once full, using O(1) frequency buckets (no full scan per
  eviction). Ties within the lowest frequency bucket evict in insertion
  order.
- **`TTLCache<T>({ ttlMs, sweepIntervalMs? })`** — every entry expires
  `ttlMs` after being set (or pass a per-key `set(key, value, ttlMs)` to
  override). Expiry is checked lazily on `get()`/`has()`, so a TTLCache
  with no sweep interval never leaks memory as long as you eventually
  read every key. `sweepIntervalMs` adds a background timer (created with
  `.unref()`, so it never keeps a Node process alive by itself) that
  proactively removes expired entries even if they're never read again;
  call `.stopSweep()` to cancel it.

## Scope and limits

- In-memory only — no persistence, no distributed/Redis backing.
- `LFUCache` breaks ties within a frequency by insertion order, not by
  recency — it is not an LFU+LRU hybrid.
- `TTLCache` expiry is wall-clock (`Date.now()`), not monotonic — system
  clock changes affect it.
- No max-memory-bytes bound on any cache; `maxSize`/no bound is by entry
  count only.

Sponsored by [Ferrow](https://ferrow.ai)

---
Part of the [ferrow-toolkit](https://github.com/FerrowAI/ferrow-toolkit) collection · Sponsored by [Ferrow](https://ferrow.ai)
