import type { NextConfig } from "next"

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000"

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@zoauro/shared", "@zoauro/api-client"],
  // The browser calls /api/* on this origin, so the session cookie stays first-party.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      // Live tracking: Socket.IO polling goes through the same origin as the API. Next
      // strips the trailing slash from /socket.io/, so match the bare path and add it back.
      { source: "/socket.io", destination: `${API_ORIGIN}/socket.io/` },
      { source: "/socket.io/:path+", destination: `${API_ORIGIN}/socket.io/:path+` },
    ]
  },
}

export default config
