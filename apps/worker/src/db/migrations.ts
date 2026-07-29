import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbClient } from "./client.js";
import {
  createMigrationRunner as createEnhancedRunner,
  type Migration as EnhancedMigration,
  type MigrationApplyResult,
} from "./migration-runner.js";

export interface Migration {
  id: number;
  name: string;
  path: string;
  sql: string;
}

export interface MigrationState {
  appliedIds: number[];
  pending: Migration[];
}

export interface MigrationRunner {
  loadMigrations(): Promise<Migration[]>;
  getState(): Promise<MigrationState>;
  applyAll(): Promise<Migration[]>;
}

/**
 * Compatibility wrapper that delegates to the canonical enhanced runner.
 * All worker paths (bootstrap, tests, infrastructure) now use the same
 * hardened lifecycle with checksums, advisory lock, duplicate-id rejection,
 * checksum-drift detection, rollback, and retry-after-rollback support.
 */
export function createMigrationRunner(
  client: DbClient,
  migrationsDir: string,
): MigrationRunner {
  const enhanced = createEnhancedRunner(client, migrationsDir);

  return {
    async loadMigrations(): Promise<Migration[]> {
      const enhancedMigrations = await enhanced.loadMigrations();
      return enhancedMigrations.map((m: EnhancedMigration) => ({
        id: m.id,
        name: m.name,
        path: m.path,
        sql: m.sql,
      }));
    },

    async getState(): Promise<MigrationState> {
      const state = await enhanced.getState();
      return {
        appliedIds: state.applied.map((r) => r.id),
        pending: state.pending.map((m) => ({
          id: m.id,
          name: m.name,
          path: m.path,
          sql: m.sql,
        })),
      };
    },

    async applyAll(): Promise<Migration[]> {
      const results: MigrationApplyResult[] = await enhanced.applyAll();

      // Only return migrations that were newly applied (or retried) in this call.
      // Already-applied migrations (no_op) are excluded, matching the legacy contract.
      const successStatuses = new Set([
        "applied",
        "retry_after_rollback",
      ]);

      const newlyAppliedIds = new Set(
        results
          .filter((r) => successStatuses.has(r.status))
          .map((r) => r.migrationId),
      );

      // Load all migrations from disk to return the full Migration objects.
      const all = await enhanced.loadMigrations();

      return all
        .filter((m) => newlyAppliedIds.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          path: m.path,
          sql: m.sql,
        }));
    },
  };
}

export function defaultMigrationsDir(): string {
  if (!import.meta.url) {
    return resolve("migrations");
  }
  // migrations live at the package root (apps/worker/migrations), while this
  // module is at src/db/migrations.ts or dist/db/migrations.js after build.
  const moduleDir = resolve(fileURLToPath(import.meta.url), "..");
  return resolve(moduleDir, "..", "..", "migrations");
}
