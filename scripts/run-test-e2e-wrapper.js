import { spawnSync, execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';

async function main() {
  console.log("Starting test-wrapper lifecycle...");
  
  const startProc = spawnSync("node", ["scripts/infrastructure-lifecycle.js", "start", "test-wrapper"], { encoding: 'utf-8' });
  
  if (startProc.status !== 0) {
    console.error("Failed to start infrastructure", startProc.stderr);
    process.exit(1);
  }

  const contextPath = startProc.stdout.trim();
  if (!contextPath || !existsSync(contextPath)) {
    console.error("Could not determine context path:", contextPath);
    process.exit(1);
  }
  
  console.log(`Lifecycle started. Context saved to ${contextPath}`);
  
  process.env.SEOVISTA_LIFECYCLE_CONTEXT_PATH = contextPath;
  const activeContextJson = readFileSync(contextPath, "utf-8");
  const activeContextObj = JSON.parse(activeContextJson);
  const activeContext = activeContextObj.context || activeContextObj;
  
  const dbPort = activeContext.hostPorts ? activeContext.hostPorts.postgres : activeContext.postgresPort;
  const redisPort = activeContext.hostPorts ? activeContext.hostPorts.redis : activeContext.redisPort;
  
  process.env.DATABASE_URL = `postgres://seovista:seovista@127.0.0.1:${dbPort}/${activeContext.databaseName}`;
  process.env.REDIS_URL = `redis://127.0.0.1:${redisPort}/0`;
  process.env.SEOVISTA_PROJECT_ID = activeContext.projectId;
  process.env.SEOVISTA_QUEUE_PREFIX = activeContext.queuePrefix;
  // Let worker know where everything is!

  let workerProc;

  try {
    console.log("Provisioning database instance...");
    execSync("node scripts/infrastructure-migrate-test-db.js", { stdio: 'inherit', env: process.env });

    console.log("Starting worker node in background...");
    workerProc = spawn("corepack", ["pnpm", "--filter", "@seovista/worker", "dev"], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === "win32"
    });

    console.log("Waiting for worker boot...");
    await new Promise((res) => setTimeout(res, 3000));

    console.log("Running Playwright Tests...");
    execSync("corepack pnpm run --filter @seovista/web --if-present test:e2e", { stdio: 'inherit', env: process.env });
    
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exitCode = 1;
  } finally {
    if (workerProc) {
      console.log("Shutting down worker process...");
      workerProc.kill();
    }

    console.log("Tearing down test-wrapper lifecycle...");
    try {
      execSync(`node scripts/infrastructure-lifecycle.js teardown ${contextPath}`, { stdio: 'inherit' });
    } catch (cleanupError) {
      console.error("Failed to teardown infrastructure:", cleanupError);
    }
  }
}

main();
