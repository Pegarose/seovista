import { nextSecurityHeaders } from "@seovista/seo-core/security/headers";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  async headers() {
    return nextSecurityHeaders();
  },
};

export default nextConfig;
