/**
 * Utility to convert Marble CDN and GCS URLs to use our proxy
 * This bypasses CORS issues with the external CDN
 */
export function proxify(url: string | null | undefined): string | null {
  if (!url) return null;

  // If it's already a relative URL (starts with /), return as-is
  if (url.startsWith("/")) return url;

  // If it's a Marble CDN URL, convert it to use our proxy
  if (url.includes("https://cdn.marble.worldlabs.ai")) {
    return url.replace("https://cdn.marble.worldlabs.ai", "/cdn-proxy");
  }

  // If it's a GCS URL, convert it to use our proxy
  if (url.includes("https://storage.googleapis.com")) {
    return url.replace("https://storage.googleapis.com", "/gcs-proxy");
  }

  // Return other URLs as-is
  return url;
}

/**
 * Check if a URL is a Marble mesh (either direct CDN or proxied)
 */
export function isMarbleMeshUrl(url: string): boolean {
  return (
    url.includes("cdn.marble.worldlabs.ai") || url.startsWith("/cdn-proxy")
  );
}

/**
 * Check if a URL is a GCS URL (either direct or proxied)
 */
export function isGcsUrl(url: string): boolean {
  return url.includes("storage.googleapis.com") || url.startsWith("/gcs-proxy");
}
