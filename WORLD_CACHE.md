# World Cache System

## Overview

The World Cache system automatically downloads and caches all preset world assets (mesh and splat files) in **browser memory** when the app launches. This significantly improves loading times and reduces bandwidth usage for preset worlds.

## How It Works

### 1. Automatic Initialization

When the app launches, the `useWorldCacheInit` hook automatically triggers the cache initialization:

```typescript
// In src/app/page.tsx
const { isInitializing, showSuccess } = useWorldCacheInit(
  presetWorldsData.map((w) => ({ meshUrl: w.meshUrl, splatUrl: w.splatUrl }))
);
```

This hook:

- Accepts the preset worlds data with their mesh and splat URLs
- Downloads all unique URLs in parallel
- Stores the files in browser memory as ArrayBuffers
- Takes ~5-15 seconds depending on network speed

### 2. Cache Storage

The cache is stored in a singleton service (`src/utils/world-cache.ts`) that:

- Maintains an in-memory Map using URLs as keys
- Stores file data as ArrayBuffers
- Tracks when each file was cached
- Provides statistics about cache size and status
- Exposed globally as `window.__WORLD_CACHE__` for easy access

### 3. Using Cached Assets in Scene.tsx

When a world is loaded in `Scene.tsx`, it checks the cache before loading:

```typescript
// Check if mesh is cached
const worldCache = (window as any).__WORLD_CACHE__;
let meshLoadUrl = meshUrl;
if (worldCache && worldCache.has(meshUrl)) {
  console.log("[WorldCache] Using cached mesh:", meshUrl);
  const cachedData = worldCache.get(meshUrl);
  const blob = new Blob([cachedData], { type: "model/gltf-binary" });
  meshLoadUrl = URL.createObjectURL(blob);
}

// Same for splat
let splatLoadUrl = splatUrl;
if (worldCache && worldCache.has(splatUrl)) {
  console.log("[WorldCache] Using cached splat:", splatUrl);
  const cachedData = worldCache.get(splatUrl);
  const blob = new Blob([cachedData], { type: "application/octet-stream" });
  splatLoadUrl = URL.createObjectURL(blob);
}
```

- **If cached**: Creates a blob URL from cached data (instant loading)
  - No network requests
  - Loads directly from browser memory
- **If not cached**: Uses the original URL
  - Falls back to fetching from CDN/proxy
  - Still works but slower

### 4. Cleanup

Blob URLs are automatically revoked during cleanup to prevent memory leaks:

```typescript
if (meshLoadUrl !== meshUrl) {
  URL.revokeObjectURL(meshLoadUrl);
}
if (splatLoadUrl !== splatUrl) {
  URL.revokeObjectURL(splatLoadUrl);
}
```

## Architecture

```
┌─────────────────┐
│   Client App    │
│   (page.tsx)    │
└────────┬────────┘
         │
         │ 1. App Launch
         ▼
┌─────────────────────┐
│ useWorldCacheInit() │
│      Hook           │
└────────┬────────────┘
         │
         │ 2. Initialize cache with preset URLs
         ▼
┌──────────────────────────┐
│   Cache Service          │
│   (world-cache.ts)       │
│   window.__WORLD_CACHE__ │
│                          │
│  ┌────────────────────┐  │
│  │  In-Memory Cache   │  │
│  │  Map<URL, data>    │  │
│  └────────────────────┘  │
└──────────┬───────────────┘
           │
           │ 3. Download from CDN
           ▼
┌────────────────────────┐
│  External CDN          │
│  (cdn.marble.world)    │
└────────────────────────┘

Later, when loading a world:

┌─────────────────┐
│  Scene.tsx      │
│  initScene()    │
└────────┬────────┘
         │
         │ 1. Check cache for meshUrl
         ▼
┌──────────────────────┐
│  window.__WORLD_     │
│  CACHE__.has(url)?   │
└────────┬─────────────┘
         │
    Yes  │  No
    ┌────┴────┐
    ▼         ▼
  Blob URL   Original URL
    │         │
    └────┬────┘
         │
         │ 2. Load with GLTFLoader/SplatMesh
         ▼
┌──────────────────────┐
│  Rendered Scene      │
└──────────────────────┘
```

## Performance Benefits

### Before Cache:

- Each world load requires downloading 10-50 MB from external CDN
- CORS proxying through Next.js rewrites
- ~3-10 seconds load time depending on connection

### After Cache:

- Files loaded directly from browser memory via blob URLs
- No network requests for cached files
- ~0.1-0.5 seconds load time
- Reduced bandwidth costs

## Memory Usage

For 3 preset worlds:

- **Mesh files**: ~10-15 MB total
- **Splat files**: ~40-60 MB total
- **Total**: ~50-75 MB of browser RAM

This is stored in the browser's memory and cleared when the tab closes.

## UI Indicators

The app shows visual feedback:

- **Blue notification**: "Loading world cache..." (during initialization)
- **Green notification**: "✓ Cache ready" (for 3 seconds after completion)
- Console logs show which files are using cache

## Files Modified/Created

### New Files:

- `src/utils/world-cache.ts` - Client-side cache service
- `src/hooks/useWorldCacheInit.ts` - React hook for initialization
- `src/app/api/world/cache/init/route.ts` - Placeholder API (not used)

### Modified Files:

- `src/app/page.tsx` - Add cache initialization hook and UI indicators
- `src/components/Scene.tsx` - Check cache before loading mesh/splat files

## API

### WorldCache Methods

```typescript
// Get cached data
const data: ArrayBuffer | undefined = worldCache.get(url);

// Check if URL is cached
const isCached: boolean = worldCache.has(url);

// Set cached data
worldCache.set(url, arrayBuffer);

// Check if initialized
const ready: boolean = worldCache.isReady();

// Get statistics
const stats = worldCache.getStats();
// Returns: { fileCount, totalSize, isInitialized }

// Clear cache
worldCache.clear();
```

### Hook Usage

```typescript
const { isInitializing, isReady, showSuccess, error } = useWorldCacheInit(
  presetWorlds // Array<{meshUrl: string, splatUrl: string}>
);
```

## Future Enhancements

Possible improvements:

1. Persist cache to IndexedDB for faster page reloads
2. Add cache invalidation/refresh mechanism
3. Cache user-generated worlds after first load
4. Add cache size limits and LRU eviction
5. Progressive loading (cache some worlds first)
6. Preload next/previous worlds in carousel for instant navigation
