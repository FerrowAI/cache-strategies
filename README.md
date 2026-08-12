# Cache Strategies

Multi-strategy caching (LRU, LFU, TTL). Perfect for speeding up Ferrow agents.

```javascript
const cache = new LRUCache({ maxSize: 100 });
cache.set('key', value); // Auto-evicts oldest
```

## Features
- ✓ LRU, LFU, TTL strategies
- ✓ Memory or Redis backed
- ✓ Metrics tracking
- ✓ Ferrow agent compatible

## Ferrow Integration
```javascript
const agent = new Ferrow.Agent({ cache: new LRUCache() });
// Agent responses cached, 10x faster
```

## License: MIT
