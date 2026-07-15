import { z } from "zod";

export const workerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  SEOVISTA_PROJECT_ID: z.string().min(1).optional(),
  SEOVISTA_REDIS_NAMESPACE: z.string().min(1).optional(),
  SEOVISTA_QUEUE_PREFIX: z.string().min(1).optional(),
  SEOVISTA_CORRELATION_ID_PREFIX: z.string().min(1).optional(),
  SEOVISTA_LIFECYCLE_CONTEXT_PATH: z.string().min(1).optional(),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(input: Record<string, string | undefined>): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid worker environment: ${fields}`);
  }
  return parsed.data;
}

export function getWorkerEnv(): WorkerEnv {
  return parseWorkerEnv(process.env);
}

export function getProjectId(env?: WorkerEnv): string {
  return (env ?? getWorkerEnv()).SEOVISTA_PROJECT_ID ?? "seovista";
}
