import { env, exit } from 'node:process';
import console from 'node:console';

export const healthStatus: 'ok' | 'degraded' | 'unhealthy' = 'ok';

export function check(): void {
  const line: string = JSON.stringify({
    status: healthStatus,
    timestamp: new Date().toISOString(),
    service: env.npm_package_name ?? '@seovista/worker',
  });

  console.log(line);
  exit(0);
}

if (import.meta.url === `file://${env.__HEALTHCHECK_ENTRY__ ?? 'src/healthcheck.ts'}`) {
  check();
}
