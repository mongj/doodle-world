import worldCache from "@/utils/world-cache";
import { useEffect, useRef, useState } from "react";

/**
 * Hook to initialize world cache on app startup
 * Downloads and caches all preset world assets in browser memory
 */
export function useWorldCacheInit(
  presetWorlds: Array<{ meshUrl: string; splatUrl: string }>
) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initStarted = useRef(false);

  useEffect(() => {
    // Only run once
    if (initStarted.current) return;
    initStarted.current = true;

    const initCache = async () => {
      try {
        setIsInitializing(true);
        console.log("[WorldCache] Initializing cache...");

        // Initialize with preset worlds
        await worldCache.initialize(presetWorlds);

        console.log("[WorldCache] Cache ready:", worldCache.getStats());

        setIsReady(true);
        setShowSuccess(true);

        // Hide success notification after 3 seconds
        setTimeout(() => {
          setShowSuccess(false);
        }, 3000);
      } catch (err) {
        console.error("[WorldCache] Failed to initialize:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsInitializing(false);
      }
    };

    // Start initialization in the background
    // Don't block the UI
    initCache();
  }, [presetWorlds]);

  return { isInitializing, isReady, showSuccess, error };
}
