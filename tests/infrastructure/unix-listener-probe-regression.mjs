import { spawnSync } from "node:child_process";
import { buildUnixListenerProbeScript } from "../../scripts/infrastructure-lifecycle-inspection.js";

const script = buildUnixListenerProbeScript([55432, 56379]);
const result = spawnSync("/bin/sh", ["-c", `PATH=/path/that-does-not-contain-ss; export PATH; ${script}`], {
  encoding: "utf8",
});

if (result.error) throw result.error;
process.stdout.write(`status=${String(result.status)}\n`);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status === 0) process.exitCode = 1;
