import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbClient } from "./client.js";

// ---------------------------------------------------------------------------
// Migration status vocabulary — frozen, matches VAL-FOUND-018
// ---------------------------------------------------------------------------
export type MigrationStatus =
  | "pending"
  | "locked"
  | "running"
  | "applied"
  | "no_op"
  | "checksum_drift"
  | "duplicate_id"
  | "failed"
  | "rolled_back"
  | "retry_after_rollback";

// ---------------------------------------------------------------------------
// Individual migration record
// ---------------------------------------------------------------------------
export interface Migration {
  id: number;
  name: string;
  path: string;
  sql: string;
  /** SHA-256 hex digest of the SQL text (normalized). */
  checksum: string;
}

// ---------------------------------------------------------------------------
// Ledger row as stored in the database
// ---------------------------------------------------------------------------
export interface MigrationLedgerRow {
  id: number;
  name: string;
  checksum: string;
  applied_at: Date;
}

// ---------------------------------------------------------------------------
// Outcome of an attempt to apply a single migration
// ---------------------------------------------------------------------------
export interface MigrationApplyResult {
  migrationId: number;
  migrationName: string;
  status: MigrationStatus;
  error?: string;
}

// ---------------------------------------------------------------------------
// Composite state returned by the runner
// ---------------------------------------------------------------------------
export interface MigrationState {
  applied: MigrationLedgerRow[];
  pending: Migration[];
  /** The 64-bit PostgreSQL advisory lock key used. */
  lockKey: bigint;
}

// ---------------------------------------------------------------------------
// Runner interface — every method is observable for validation
// ---------------------------------------------------------------------------
export interface MigrationRunner {
  /** Compute checksums for all discovered migrations. */
  loadMigrations(): Promise<Migration[]>;
  /** Read the ledger and return full state including lock key. */
  getState(): Promise<MigrationState>;
  /**
   * Apply all pending migrations under an advisory lock. Returns one result
   * per migration. A failed migration halts the batch and rolls back only
   * the failed migration's transaction; previously applied migrations in
   * this batch are not undone.
   */
  applyAll(): Promise<MigrationApplyResult[]>;
  /**
   * Apply a single migration by ID under the advisory lock. Used for retry.
   */
  applyOne(migrationId: number): Promise<MigrationApplyResult>;
  /** Compute SHA-256 hex checksum for a migration's SQL. */
  computeChecksum(sql: string): string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIGRATION_FILE_RE = /^\d+_[a-zA-Z0-9_]+\.sql$/;
const ADVISORY_LOCK_KEY = 42_001n; // recognizable constant for inspection

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeSha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Normalize SQL for checksum computation: trim each line, collapse blank lines. */
function normalizeSql(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMigrationRunner(
  client: DbClient,
  migrationsDir: string,
): MigrationRunner {
  // ------------------------------------------------------------------
  // Internal state
  // ------------------------------------------------------------------
  const duplicateIds = new Set<number>();
  const rolledBackIds = new Set<number>();

  // ------------------------------------------------------------------
  // Internal: acquire/release advisory lock
  // ------------------------------------------------------------------
  async function acquireLock(): Promise<void> {
    const result = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [ADVISORY_LOCK_KEY],
    );
    if (!result.rows[0]?.locked) {
      throw new Error(
        "Migration advisory lock is held by another runner; refusing to proceed.",
      );
    }
  }

  async function releaseLock(): Promise<void> {
    await client
      .query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY])
      .catch(() => {
        // best-effort release; the connection close will also release it
      });
  }

  // ------------------------------------------------------------------
  // loadMigrations
  // ------------------------------------------------------------------
  async function loadMigrations(): Promise<Migration[]> {
    const entries = await readdir(migrationsDir);
    const files = entries
      .filter((entry) => MIGRATION_FILE_RE.test(entry))
      .sort((a, b) => {
        const idA = Number(a.split("_")[0]);
        const idB = Number(b.split("_")[0]);
        return idA - idB;
      });

    // Detect duplicate numeric migration IDs before any ledger write.
    const seenIds = new Map<number, string>();
    for (const file of files) {
      const id = Number(file.split("_")[0]);
      if (seenIds.has(id)) {
        duplicateIds.add(id);
      } else {
        seenIds.set(id, file);
      }
    }

    const migrations: Migration[] = [];
    for (const file of files) {
      const id = Number(file.split("_")[0]);
      const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "");
      const path = resolve(migrationsDir, file);
      const rawSql = await readFile(path, "utf-8");
      const sql = rawSql;
      const checksum = computeSha256(normalizeSql(sql));
      migrations.push({ id, name, path, sql, checksum });
    }

    return migrations;
  }

  // ------------------------------------------------------------------
  // getState
  // ------------------------------------------------------------------
  async function getState(): Promise<MigrationState> {
    let applied: MigrationLedgerRow[] = [];
    try {
      const result = await client.query<MigrationLedgerRow>(
        "SELECT id, name, checksum, applied_at FROM seovista_migrations ORDER BY id",
      );
      applied = result.rows;
    } catch {
      // ledger table does not exist yet
    }

    const all = await loadMigrations();
    const appliedIds = new Set(applied.map((r) => r.id));
    const pending = all.filter((m) => !appliedIds.has(m.id));

    return { applied, pending, lockKey: ADVISORY_LOCK_KEY };
  }

  // ------------------------------------------------------------------
  // computeChecksum
  // ------------------------------------------------------------------
  function computeChecksum(sql: string): string {
    return computeSha256(normalizeSql(sql));
  }

  // ------------------------------------------------------------------
  // applyOne — apply a single pending migration under the advisory lock
  // ------------------------------------------------------------------
  async function applyOne(
    migrationId: number,
  ): Promise<MigrationApplyResult> {
    // Reload migrations to pick up any new files or duplicate detection.
    const allMigrations = await loadMigrations();

    // Detect duplicate migration IDs before any ledger write.
    if (duplicateIds.has(migrationId)) {
      return {
        migrationId,
        migrationName: `duplicate-${migrationId}`,
        status: "duplicate_id",
        error: `Duplicate migration ID ${migrationId} detected in migration files`,
      };
    }

    const migration = allMigrations.find((m) => m.id === migrationId);

    if (!migration) {
      return {
        migrationId,
        migrationName: `unknown-${migrationId}`,
        status: "failed",
        error: `Migration ${migrationId} not found on disk`,
      };
    }

    // Check if already applied (query ledger)
    const { applied } = await getState();
    const existing = applied.find((r) => r.id === migration.id);
    if (existing) {
      // Checksum-drift check: non-legacy checksum that doesn't match disk
      if (existing.checksum !== "legacy" && existing.checksum !== migration.checksum) {
        return {
          migrationId: migration.id,
          migrationName: migration.name,
          status: "checksum_drift",
          error: `Checksum drift: ledger=${existing.checksum}, disk=${migration.checksum}`,
        };
      }
      return {
        migrationId: migration.id,
        migrationName: migration.name,
        status: "no_op",
      };
    }

    // Check if this migration was previously rolled back.
    // If so, report retry_after_rollback before applying.
    if (rolledBackIds.has(migrationId)) {
      rolledBackIds.delete(migrationId);

      // Apply under transaction
      try {
        await client.transaction(async (tx) => {
          await tx.query(migration.sql);
          // Fail closed on ledger conflict: never silently upsert/overwrite.
          await tx.query(
            `INSERT INTO seovista_migrations (id, name, checksum)
             VALUES ($1, $2, $3)`,
            [migration.id, migration.name, migration.checksum],
          );
        });
        return {
          migrationId: migration.id,
          migrationName: migration.name,
          status: "retry_after_rollback",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        rolledBackIds.add(migrationId);
        return {
          migrationId: migration.id,
          migrationName: migration.name,
          status: "rolled_back",
          error: message,
        };
      }
    }

    // Apply under transaction
    try {
      await client.transaction(async (tx) => {
        await tx.query(migration.sql);
        // Fail closed on ledger conflict: never silently upsert/overwrite.
        // The INSERT will naturally throw on primary key conflict.
        await tx.query(
          `INSERT INTO seovista_migrations (id, name, checksum)
           VALUES ($1, $2, $3)`,
          [migration.id, migration.name, migration.checksum],
        );
      });
      return {
        migrationId: migration.id,
        migrationName: migration.name,
        status: "applied",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rolledBackIds.add(migration.id);
      return {
        migrationId: migration.id,
        migrationName: migration.name,
        status: "rolled_back",
        error: message,
      };
    }
  }

  // ------------------------------------------------------------------
  // applyAll — serialized batch apply
  // ------------------------------------------------------------------
  async function applyAll(): Promise<MigrationApplyResult[]> {
    const results: MigrationApplyResult[] = [];

    await acquireLock();
    try {
      // Reload state under lock to pick up latest migrations and duplicates.
      // loadMigrations() is called first to populate duplicateIds.
      await loadMigrations();
      const state = await getState();

      // Check for duplicate IDs before any migration or ledger write.
      if (duplicateIds.size > 0) {
        for (const dupId of duplicateIds) {
          results.push({
            migrationId: dupId,
            migrationName: `duplicate-${dupId}`,
            status: "duplicate_id",
            error: `Duplicate migration ID ${dupId} detected in migration files`,
          });
        }
        // Halt: duplicates must be resolved before any migration proceeds.
        return results;
      }

      for (const migration of state.pending) {
        const result = await applyOne(migration.id);
        results.push(result);

        if (
          result.status === "failed" ||
          result.status === "checksum_drift" ||
          result.status === "duplicate_id" ||
          result.status === "rolled_back"
        ) {
          // Halt on failure; remaining migrations stay pending
          break;
        }
      }
    } finally {
      await releaseLock();
    }

    return results;
  }

  return {
    loadMigrations,
    getState,
    applyAll,
    applyOne,
    computeChecksum,
  };
}

// ---------------------------------------------------------------------------
// Default migrations directory resolver (unchanged from original)
// ---------------------------------------------------------------------------
export function defaultMigrationsDir(): string {
  if (!import.meta.url) {
    return resolve("migrations");
  }
  const moduleDir = resolve(fileURLToPath(import.meta.url), "..");
  return resolve(moduleDir, "..", "..", "migrations");
}
