const DEFAULT_MAX = 50;

export class ImageCache {
  private cache = new Map<string, HTMLImageElement>();
  private maxSize: number;

  constructor(maxSize: number = DEFAULT_MAX) {
    this.maxSize = maxSize;
  }

  get(key: string): HTMLImageElement | undefined {
    const img = this.cache.get(key);
    if (img) {
      this.cache.delete(key);
      this.cache.set(key, img);
    }
    return img;
  }

  set(key: string, img: HTMLImageElement) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        const evicted = this.cache.get(oldest);
        if (evicted) evicted.src = "";
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, img);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get size() {
    return this.cache.size;
  }
}
