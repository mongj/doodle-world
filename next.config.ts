import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable WebAssembly support
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },

  // Configure external image domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.marble.worldlabs.ai",
      },
    ],
  },

  // Add COOP/COEP headers for SharedArrayBuffer support (required by Rapier)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        // Add CORP header for proxied CDN resources
        source: "/cdn-proxy/:path*",
        headers: [
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
        ],
      },
      {
        // Add CORP header for proxied GCS resources
        source: "/gcs-proxy/:path*",
        headers: [
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
        ],
      },
    ];
  },

  // Proxy Marble CDN and GCS through our domain to bypass CORS
  async rewrites() {
    return [
      {
        source: "/cdn-proxy/:path*",
        destination: "https://cdn.marble.worldlabs.ai/:path*",
      },
      {
        source: "/gcs-proxy/:path*",
        destination: "https://storage.googleapis.com/:path*",
      },
    ];
  },
};

export default nextConfig;
