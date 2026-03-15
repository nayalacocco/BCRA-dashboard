import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from BCRA domain if needed
  images: {
    remotePatterns: [],
  },
  // Headers for security
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        ],
      },
    ];
  },
};

export default nextConfig;
