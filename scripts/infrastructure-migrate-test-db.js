import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;

async function main() {
  const lifecycleContextPath = process.env.SEOVISTA_LIFECYCLE_CONTEXT_PATH;
  if (!lifecycleContextPath || !existsSync(lifecycleContextPath)) {
    console.error("SEOVISTA_LIFECYCLE_CONTEXT_PATH not provided or doesn't exist");
    process.exit(1);
  }

  const activeContextJson = readFileSync(lifecycleContextPath, "utf-8");
  const activeContextObj = JSON.parse(activeContextJson);
  const activeContext = activeContextObj.context || activeContextObj;

  const dbPort = activeContext.hostPorts ? activeContext.hostPorts.postgres : activeContext.postgresPort;
  const dbName = activeContext.databaseName || "seovista";

  if (!dbPort) {
    console.error("Could not find Postgres port in active context");
    process.exit(1);
  }

  console.log(`Connecting to Postgres default DB on port ${dbPort} to create test DB '${dbName}'...`);
  
  const client = new Client({
    host: "127.0.0.1",
    port: dbPort,
    user: "seovista",
    password: "seovista",
    database: "postgres"
  });

  await client.connect();

  try {
    console.log(`Executing CREATE DATABASE "${dbName}"...`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log("Database created successfully!");
  } catch (error) {
    if (error.code === '42P04') {
      console.log(`Database "${dbName}" already exists, proceeding.`);
    } else {
      console.error("Failed to create database:", error);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`Running migrations for ${dbName}...`);
  const databaseUrl = `postgres://seovista:seovista@127.0.0.1:${dbPort}/${dbName}`;
  
  process.env.DATABASE_URL = databaseUrl;
  process.env.SEOVISTA_ADMIN_PASSWORD = "test-admin-password";
  
  execSync("corepack pnpm --filter @seovista/worker db:bootstrap", { stdio: "inherit", env: process.env });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
