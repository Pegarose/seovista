import { nextSecurityHeaders } from "@seovista/seo-core/security/headers";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import type { NextConfig } from "next";

const nextConfig = (phase: string): NextConfig => ({
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  async headers() {
    return nextSecurityHeaders({
      allowUnsafeEval: phase === PHASE_DEVELOPMENT_SERVER,
    });
  },
});

export default nextConfig;
