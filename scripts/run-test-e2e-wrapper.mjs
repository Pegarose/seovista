const { spawn, execSync, spawnSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');

async function main() {
  console.log("Starting test-wrapper lifecycle...");
  
  // 1. Start lifecycle
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

  try {
    // 2. Provision Database (create the DB inside postgres)
    console.log("Provisioning database instance...");
    execSync("node scripts/infrastructure-migrate-test-db.js", { stdio: 'inherit', env: process.env });

    // 3. Run Playwright Tests!
    console.log("Running Playwright Tests...");
    execSync("corepack pnpm run --filter @seovista/web --if-present test:e2e", { stdio: 'inherit', env: process.env });
    
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exitCode = 1;
  } finally {
    // 4. Teardown
    console.log("Tearing down test-wrapper lifecycle...");
    try {
      execSync(`node scripts/infrastructure-lifecycle.js teardown ${contextPath}`, { stdio: 'inherit' });
    } catch (cleanupError) {
      console.error("Failed to teardown infrastructure:", cleanupError);
    }
  }
}

main();
