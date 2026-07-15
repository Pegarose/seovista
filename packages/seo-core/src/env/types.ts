import type { z } from "zod";
import type { publicEnvSchema, serverEnvSchema } from "./schema.js";

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
