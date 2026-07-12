import { spawn } from "node:child_process";
import { once } from "node:events";

const children = [];

function start(command, args, options) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    ...options,
  });
  children.push(child);
  return child;
}

async function readiness(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Readiness failed for ${url}`);
}

async function main() {
  const web = start("pnpm", ["--filter", "@seovista/web", "dev"], {
    env: { ...process.env, PORT: "3100" },
  });
  const nextg = start("pnpm", ["--filter", "@seovista/nextg", "dev"], {
    env: { ...process.env, PORT: "3101" },
  });

  await readiness("http://localhost:3101/health", 60000);
  await readiness("http://localhost:3100/", 60000);

  console.log("[dev] web (3100) and nextg mock (3101) are ready");

  await Promise.race([
    Promise.all([once(web, "exit"), once(nextg, "exit")]),
    once(process, "SIGINT"),
    once(process, "SIGTERM"),
  ]);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[dev] failed:", err);
  shutdown();
  process.exit(1);
});
