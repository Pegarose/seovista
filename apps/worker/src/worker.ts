import { env, exit } from 'node:process';
import console from 'node:console';

export const workerName: string = '@seovista/worker';

export function run(): void {
  const logLine: string = JSON.stringify({
    name: workerName,
    status: 'started',
    timestamp: new Date().toISOString(),
  });

  console.log(logLine);
  exit(0);
}

if (import.meta.url === `file://${env.__WORKER_ENTRY__ ?? 'src/worker.ts'}`) {
  run();
}
