/**
 * Client-side cache for world assets (mesh and splat files)
 * This cache stores downloaded files in memory using URL as key
 */

interface CachedAsset {
  data: ArrayBuffer;
  url: string;
  loadedAt: number;
}

class WorldCache {
  private cache: Map<string, CachedAsset> = new Map();
  private initializationPromise: Promise<void> | null = null;
  private isInitialized = false;

  /**
   * Get cached asset by URL
   */
  get(url: string): ArrayBuffer | undefined {
    const asset = this.cache.get(url);
    return asset?.data;
  }

  /**
   * Check if URL is cached
   */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Set cached asset
   */
  set(url: string, data: ArrayBuffer): void {
    this.cache.set(url, {
      data,
      url,
      loadedAt: Date.now(),
    });
  }

  /**
   * Get all cached URLs
   */
  getCachedUrls(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if cache is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Initialize cache by downloading all preset world assets
   */
  async initialize(
    presetWorlds: Array<{ meshUrl: string; splatUrl: string }>
  ): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = this._doInitialize(presetWorlds);
    await this.initializationPromise;
  }

  private async _doInitialize(
    presetWorlds: Array<{ meshUrl: string; splatUrl: string }>
  ): Promise<void> {
    console.log("[WorldCache] Starting cache initialization...");
    const startTime = Date.now();

    try {
      console.log(
        `[WorldCache] Found ${presetWorlds.length} preset worlds to cache`
      );

      // Collect all unique URLs to download
      const urls = new Set<string>();
      presetWorlds.forEach((world) => {
        urls.add(world.meshUrl);
        urls.add(world.splatUrl);
      });

      // Download all files in parallel
      const downloadPromises = Array.from(urls).map((url) =>
        this._downloadFile(url)
      );

      await Promise.all(downloadPromises);

      this.isInitialized = true;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[WorldCache] Cache initialized successfully in ${duration}s`
      );
      console.log(`[WorldCache] Cached ${this.cache.size} files`);
    } catch (error) {
      console.error("[WorldCache] Error initializing cache:", error);
      // Reset initialization promise so it can be retried
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Download a file and store in cache
   */
  private async _downloadFile(url: string): Promise<void> {
    try {
      console.log(`[WorldCache] Downloading ${url}...`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      this.set(url, arrayBuffer);

      console.log(
        `[WorldCache] ✓ Downloaded (${(
          arrayBuffer.byteLength /
          1024 /
          1024
        ).toFixed(2)} MB)`
      );
    } catch (error) {
      console.error(`[WorldCache] ✗ Failed to download:`, error);
    }
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.isInitialized = false;
    this.initializationPromise = null;
    console.log("[WorldCache] Cache cleared");
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalSize = 0;
    this.cache.forEach((asset) => {
      totalSize += asset.data.byteLength;
    });

    return {
      fileCount: this.cache.size,
      totalSize,
      isInitialized: this.isInitialized,
    };
  }
}

// Singleton instance
const worldCache = new WorldCache();

// Make it available globally for Scene.tsx
if (typeof window !== "undefined") {
  (window as any).__WORLD_CACHE__ = worldCache;
}

export default worldCache;
