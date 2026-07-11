import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Don't let Next.js redirect /socket.io/ -> /socket.io (breaks the proxy).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Proxy socket.io + engine HTTP endpoints to the game engine on port 3003.
    // The /socket.io base rules are needed because engine.io polling hits
    // "/socket.io/" with an EMPTY path segment, which "/socket.io/:path*"
    // alone does not match.
    return [
      { source: "/socket.io", destination: "http://localhost:3003/socket.io" },
      { source: "/socket.io/", destination: "http://localhost:3003/socket.io/" },
      { source: "/socket.io/:path*", destination: "http://localhost:3003/socket.io/:path*" },
      { source: "/engine/:path*", destination: "http://localhost:3003/:path*" },
    ];
  },
};

export default nextConfig;
