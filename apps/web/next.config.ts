import { nextSecurityHeaders } from "@seovista/seo-core/security/headers";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  async headers() {
    return nextSecurityHeaders();
  },
};

export default nextConfig;
