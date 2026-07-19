import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Don't let Next.js redirect /socket.io/ -> /socket.io (breaks the proxy).
  skipTrailingSlashRedirect: true,
  // Strip source maps from production builds — halves the JS payload weight
  // served to end users (the .map files are only useful for dev debugging).
  productionBrowserSourceMaps: false,
  // Don't advertise the framework via the X-Powered-By header.
  poweredByHeader: false,
  // Optimize barrel-export packages so only the used icons/components ship
  // to the client instead of the entire library's worth of module specifiers.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    // Proxy socket.io + engine HTTP endpoints to the game engine on port 3003.
    // The /socket.io base rules are needed because engine.io polling hits
    // "/socket.io/" with an EMPTY path segment, which "/socket.io/:path*"
    // alone does not match.
    return [
      // NOTE: destinations must keep the trailing slash — engine.io's path
      // check rejects "/socket.io" without it, and Next source-matching
      // normalizes the request path's trailing slash away.
      { source: "/socket.io", destination: "http://localhost:3003/socket.io/" },
      { source: "/socket.io/", destination: "http://localhost:3003/socket.io/" },
      { source: "/socket.io/:path*", destination: "http://localhost:3003/socket.io/:path*" },
      { source: "/engine/:path*", destination: "http://localhost:3003/:path*" },
    ];
  },
};

export default nextConfig;
