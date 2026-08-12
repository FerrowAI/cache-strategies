export class LRUCache<T> {
  private cache = new Map<string, T>();
  private maxSize: number;
  constructor(options: { maxSize: number }) { this.maxSize = options.maxSize; }
  
  get(key: string): T | undefined { return this.cache.get(key); }
  
  set(key: string, value: T): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}
