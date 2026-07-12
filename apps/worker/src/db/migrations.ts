import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbClient } from "./client.js";

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

const MIGRATION_FILE_RE = /^\d+_[a-zA-Z0-9_]+\.sql$/;

export function createMigrationRunner(
  client: DbClient,
  migrationsDir: string
): MigrationRunner {
  return {
    async loadMigrations(): Promise<Migration[]> {
      const entries = await readdir(migrationsDir);
      const files = entries
        .filter((entry) => MIGRATION_FILE_RE.test(entry))
        .sort((a, b) => {
          const idA = Number(a.split("_")[0]);
          const idB = Number(b.split("_")[0]);
          return idA - idB;
        });

      const migrations: Migration[] = [];
      for (const file of files) {
        const id = Number(file.split("_")[0]);
        const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "");
        const path = resolve(migrationsDir, file);
        const sql = await readFile(path, "utf-8");
        migrations.push({ id, name, path, sql });
      }

      return migrations;
    },

    async getState(): Promise<MigrationState> {
      let appliedIds: number[] = [];
      try {
        const result = await client.query<{ id: number }>(
          "SELECT id FROM seovista_migrations ORDER BY id"
        );
        appliedIds = result.rows.map((row) => row.id);
      } catch {
        // Migration tracking table does not exist yet; it will be created by
        // the first migration inside the same transactional batch.
      }

      const migrations = await this.loadMigrations();
      const pending = migrations.filter((m) => !appliedIds.includes(m.id));
      return { appliedIds, pending };
    },

    async applyAll(): Promise<Migration[]> {
      const { pending } = await this.getState();
      const applied: Migration[] = [];

      for (const migration of pending) {
        await client.transaction(async (tx) => {
          await tx.query(migration.sql);
          await tx.query(
            "INSERT INTO seovista_migrations (id, name) VALUES ($1, $2)",
            [migration.id, migration.name]
          );
        });
        applied.push(migration);
      }

      return applied;
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
