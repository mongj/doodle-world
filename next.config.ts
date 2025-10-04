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
    ];
  },
};

export default nextConfig;
