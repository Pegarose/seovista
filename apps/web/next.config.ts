import { nextSecurityHeaders } from "@seovista/seo-core/security/headers";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: {
    ignoreBuildErrors: process.env.SEOVISTA_SENTINEL_BUILD === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.SEOVISTA_SENTINEL_BUILD === "true",
  },
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  async headers() {
    return nextSecurityHeaders();
  },
};

export default nextConfig;
