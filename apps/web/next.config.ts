import { nextSecurityHeaders } from "@seovista/seo-core/security/headers";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import type { NextConfig } from "next";

type WebpackConfig = NonNullable<Parameters<NonNullable<NextConfig["webpack"]>>[0]>;

const nextConfig = (phase: string): NextConfig => ({
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["@seovista/worker", "bullmq", "ioredis"],
  async headers() {
    return nextSecurityHeaders({
      allowUnsafeEval: phase === PHASE_DEVELOPMENT_SERVER,
    });
  },
  webpack: (config: WebpackConfig, { isServer }: { isServer: boolean }) => {
    // Webpack cannot resolve the "node:" URI scheme (e.g. `import ... from
    // "node:crypto"`, pulled in via @seovista/seo-core's barrel export).
    // Rewrite "node:*" requests to their plain builtin name so the server
    // bundle resolves Node builtins and the client bundle can stub them.
    config.plugins = config.plugins ?? [];
    config.plugins.push({
      apply(compiler: any) {
        compiler.hooks.normalModuleFactory.tap("NodeSchemePlugin", (factory: any) => {
          factory.hooks.beforeResolve.tap("NodeSchemePlugin", (data: any) => {
            if (data && typeof data.request === "string" && data.request.startsWith("node:")) {
              data.request = data.request.slice("node:".length);
            }
          });
        });
      },
    });

    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        crypto: false,
      };
    }
    return config;
  },
});

export default nextConfig;
