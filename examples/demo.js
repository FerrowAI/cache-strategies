const { LRUCache, LFUCache, TTLCache } = require('../dist/index.js');

// --- LRU: prove get() refreshes recency (fixes the old insertion-order-only bug) ---
const lru = new LRUCache({ maxSize: 3 });
lru.set('a', 1);
lru.set('b', 2);
lru.set('c', 3);
lru.get('a'); // touch 'a' -> now most recently used; 'b' becomes least recent
lru.set('d', 4); // should evict 'b', NOT 'a' (old buggy behavior evicted by insertion order only)
console.log('LRU has a (should be true, refreshed by get):', lru.has('a'));
console.log('LRU has b (should be false, evicted):', lru.has('b'));
console.log('LRU stats:', lru.stats());

// --- LFU: least-frequently-used is evicted ---
const lfu = new LFUCache({ maxSize: 2 });
lfu.set('x', 1);
lfu.set('y', 2);
lfu.get('x'); // x freq=2, y freq=1
lfu.set('z', 3); // should evict 'y' (lowest frequency), not 'x'
console.log('\nLFU has x (should be true, higher freq):', lfu.has('x'));
console.log('LFU has y (should be false, evicted):', lfu.has('y'));
console.log('LFU stats:', lfu.stats());

// --- TTL: entries expire ---
const ttl = new TTLCache({ ttlMs: 30 });
ttl.set('k', 'v');
console.log('\nTTL immediately (should be v):', ttl.get('k'));

setTimeout(() => {
  console.log('TTL after expiry (should be undefined):', ttl.get('k'));
  console.log('TTL stats:', ttl.stats());
}, 60);
