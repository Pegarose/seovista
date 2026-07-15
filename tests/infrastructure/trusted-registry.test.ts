import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { platform, tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalizeLifecyclePath,
  createRunContext,
  getContextPath,
  getRegistryPath,
  readTrustedLifecycleContext,
  retireLifecycleContext,
  writeLifecycleContext,
} from "../../scripts/infrastructure-lifecycle-core.js";

function contextFixture(root: string) {
  return createRunContext({
    root,
    runId: "review-authority",
    nonce: "abcdef123456",
    ownershipToken: "a".repeat(64),
    createdAt: "2026-07-15T00:00:00.000Z",
  });
}

function runRegistrationProcess(root: string, identity: string): Promise<void> {
  const coreModuleUrl = new URL("../../scripts/infrastructure-lifecycle-core.js", import.meta.url).href;
  const script = `
    import { createRunContext, getContextPath, writeLifecycleContext } from ${JSON.stringify(coreModuleUrl)};
    const root = process.argv[1];
    const identity = process.argv[2];
    const context = createRunContext({
      root,
      runId: identity,
      nonce: identity.endsWith("one") ? "111111111111" : "222222222222",
      ownershipToken: identity.endsWith("one") ? "1".repeat(64) : "2".repeat(64),
      createdAt: "2026-07-15T00:00:00.000Z",
    });
    writeLifecycleContext(context, getContextPath(context, root), { root });
  `;

  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script, root, identity], {
      stdio: "pipe",
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { output += data.toString(); });
    child.once("error", rejectProcess);
    child.once("close", (code) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(`registration process failed with ${code}: ${output}`));
    });
  });
}

describe("trusted lifecycle registry", () => {
  it("rejects a synthesized context even when its digest and Docker-visible token are self-consistent", () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-registry-"));
    const trusted = contextFixture(root);
    const trustedPath = getContextPath(trusted, root);
    writeLifecycleContext(trusted, trustedPath);

    const synthesized = { ...trusted, composeProject: "review-authority-forged" };
    const synthesizedPath = resolve(root, ".lifecycle-evidence", "forged-context.json");
    writeLifecycleContext(synthesized, synthesizedPath, { register: false });

    expect(() => readTrustedLifecycleContext(synthesizedPath, root)).toThrow(/trusted|registry|canonical/i);
  });

  it("binds authority to the canonical context path and permits retired idempotent teardown only at that path", () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-registry-"));
    const context = contextFixture(root);
    const contextPath = getContextPath(context, root);
    writeLifecycleContext(context, contextPath);

    const copiedPath = resolve(root, ".lifecycle-evidence", "copied-context.json");
    writeFileSync(copiedPath, readFileSync(contextPath));

    expect(() => readTrustedLifecycleContext(copiedPath, root)).toThrow(/canonical|path/i);
    retireLifecycleContext(contextPath, root);
    expect(readTrustedLifecycleContext(contextPath, root, { allowRetired: true }).status).toBe("retired");
    expect(() => readTrustedLifecycleContext(contextPath, root)).toThrow(/retired/i);
    expect(getRegistryPath(root)).not.toBe(contextPath);
  });

  it("preserves resolved path casing on case-sensitive platforms and folds it only on Windows", () => {
    const mixedCasePath = resolve(tmpdir(), "SeoVista-Case-Sensitive", "Evidence.json");
    const resolvedPath = resolve(mixedCasePath).replaceAll("\\", "/");

    expect(canonicalizeLifecyclePath(mixedCasePath, "linux")).toBe(resolvedPath);
    expect(canonicalizeLifecyclePath(mixedCasePath, "darwin")).toBe(resolvedPath);
    expect(canonicalizeLifecyclePath(mixedCasePath, "win32")).toBe(resolvedPath.toLowerCase());
  });

  it.skipIf(platform() === "win32")(
    "rejects an evidence directory case-only mutation after the public digest is recomputed",
    () => {
      const root = mkdtempSync(resolve(tmpdir(), "seovista-registry-case-mutation-"));
      const context = contextFixture(root);
      const contextPath = getContextPath(context, root);
      writeLifecycleContext(context, contextPath, { root });

      const caseMutatedDirectory = context.evidenceDirectory.replace(".lifecycle-evidence", ".LIFECYCLE-EVIDENCE");
      expect(caseMutatedDirectory).not.toBe(context.evidenceDirectory);
      const forgedPath = resolve(root, ".lifecycle-evidence", "forged-case-public-digest.json");
      writeLifecycleContext({ ...context, evidenceDirectory: caseMutatedDirectory }, forgedPath, { register: false });
      writeFileSync(contextPath, readFileSync(forgedPath));

      expect(() => readTrustedLifecycleContext(contextPath, root)).toThrow(/authority|trusted/i);
    },
  );

  it.each([
    ["schemaVersion", (context: ReturnType<typeof contextFixture>) => ({ ...context, schemaVersion: 2 })],
    ["runId", (context: ReturnType<typeof contextFixture>) => ({ ...context, runId: `${context.runId}-forged` })],
    ["projectId", (context: ReturnType<typeof contextFixture>) => ({ ...context, projectId: `${context.projectId}-forged` })],
    ["composeProject", (context: ReturnType<typeof contextFixture>) => ({ ...context, composeProject: `${context.composeProject}-forged` })],
    ["databaseName", (context: ReturnType<typeof contextFixture>) => ({ ...context, databaseName: "forged_database" })],
    ["redisNamespace", (context: ReturnType<typeof contextFixture>) => ({ ...context, redisNamespace: "forged:" })],
    ["redisDatabase", (context: ReturnType<typeof contextFixture>) => ({ ...context, redisDatabase: 1 })],
    ["queuePrefix", (context: ReturnType<typeof contextFixture>) => ({ ...context, queuePrefix: "forged:queue" })],
    ["correlationIdPrefix", (context: ReturnType<typeof contextFixture>) => ({ ...context, correlationIdPrefix: "forged-correlation-" })],
    ["postgres port", (context: ReturnType<typeof contextFixture>) => ({ ...context, hostPorts: { ...context.hostPorts, postgres: 1 } })],
    ["Redis port", (context: ReturnType<typeof contextFixture>) => ({ ...context, hostPorts: { ...context.hostPorts, redis: 2 } })],
    ["createdAt", (context: ReturnType<typeof contextFixture>) => ({ ...context, createdAt: "2026-07-15T00:00:01.000Z" })],
    ["cleanupAuthority", (context: ReturnType<typeof contextFixture>) => ({ ...context, cleanupAuthority: "context:forged" })],
    ["evidenceDirectory", (context: ReturnType<typeof contextFixture>) => ({ ...context, evidenceDirectory: resolve(context.evidenceDirectory, "forged") })],
    ["ownershipToken", (context: ReturnType<typeof contextFixture>) => ({ ...context, ownershipToken: "f".repeat(64) })],
  ])("rejects a %s mutation even when the public digest is recomputed", (_field, mutate) => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-registry-mutation-"));
    const context = contextFixture(root);
    const contextPath = getContextPath(context, root);
    writeLifecycleContext(context, contextPath, { root });

    const forgedPath = resolve(root, ".lifecycle-evidence", "forged-public-digest.json");
    writeLifecycleContext(mutate(context), forgedPath, { register: false });
    writeFileSync(contextPath, readFileSync(forgedPath));

    expect(() => readTrustedLifecycleContext(contextPath, root)).toThrow(/authority|canonical|trusted/i);
  });

  it("retains both trusted records when registrations run concurrently", async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const root = mkdtempSync(resolve(tmpdir(), "seovista-registry-concurrent-"));

      await Promise.all([
        runRegistrationProcess(root, "concurrent-one"),
        runRegistrationProcess(root, "concurrent-two"),
      ]);

      const evidenceDirectory = resolve(root, ".lifecycle-evidence");
      const firstPath = resolve(evidenceDirectory, "concurrent-one-111111111111-context.json");
      const secondPath = resolve(evidenceDirectory, "concurrent-two-222222222222-context.json");
      expect(readTrustedLifecycleContext(firstPath, root).status).toBe("active");
      expect(readTrustedLifecycleContext(secondPath, root).status).toBe("active");
    }
  });
});
