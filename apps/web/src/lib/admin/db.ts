import "server-only";

import { createDbClient, type DbClient } from "@seovista/worker";

let sharedClient: DbClient | undefined;

export function getAdminDb(): DbClient {
  if (sharedClient) return sharedClient;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for admin routes");
  }

  sharedClient = createDbClient({ connectionString, max: 5 });
  return sharedClient;
}

export async function closeAdminDb(): Promise<void> {
  if (!sharedClient) return;
  const client = sharedClient;
  sharedClient = undefined;
  await client.close();
}
