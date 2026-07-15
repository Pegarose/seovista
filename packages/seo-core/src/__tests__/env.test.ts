import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  combinedEnvSchema,
  publicEnvSchema,
  serverEnvSchema,
  webEnvSchema,
  workerEnvSchema,
  validateEnv,
  validateWebEnv,
  validateWorkerEnv,
  EnvValidationError,
  ENV_VARIABLES,
} from "../env/index.js";
import { publicEnvSchema as clientPublicEnvSchema } from "../env/client.js";

const completeEnv = {
  NEXT_PUBLIC_SITE_URL: "https://seovista.com",
  NEXT_PUBLIC_ANALYTICS_ID: "analytics-123",
  DATABASE_URL: "placeholder-database-url",
  REDIS_URL: "redis://placeholder-redis",
  NEXTG_API_URL: "http://localhost:3101",
  NEXTG_API_TOKEN: "placeholder-nextg-token",
  DATAFORSEO_API_KEY: "placeholder-dataforseo-key",
  GOOGLE_CLIENT_ID: "placeholder-google-client",
  GOOGLE_CLIENT_SECRET: "placeholder-google-secret",
  GOOGLE_REDIRECT_URI: "https://seovista.com/auth/callback",
  OBJECT_STORAGE_ENDPOINT: "https://s3.example.com",
  OBJECT_STORAGE_BUCKET: "seovista",
  OBJECT_STORAGE_ACCESS_KEY: "placeholder-storage-access",
  OBJECT_STORAGE_SECRET_KEY: "placeholder-storage-secret",
  EMAIL_PROVIDER_API_KEY: "placeholder-email-key",
  EMAIL_FROM: "hello@seovista.com",
  SENTRY_DSN: "https://sentry.example.com/1",
  REPORT_SIGNING_SECRET: "placeholder-signing-secret",
  AUDIT_DAILY_COST_LIMIT: "100",
  AUDIT_PER_IP_RATE_LIMIT: "10",
};

describe("environment manifest", () => {
  it("declares all 20 consumed variables", () => {
    expect(ENV_VARIABLES).toHaveLength(20);
  });

  it("exposes only NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_ANALYTICS_ID as public", () => {
    const publicVars = ENV_VARIABLES.filter((v) => v.classification === "public");
    expect(publicVars.map((v) => v.name)).toEqual([
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_ANALYTICS_ID",
    ]);
  });
});

describe("combined env schema", () => {
  it("validates a complete environment", () => {
    const parsed = combinedEnvSchema.parse(completeEnv);
    expect(parsed.NEXT_PUBLIC_SITE_URL).toBe("https://seovista.com");
    expect(parsed.DATABASE_URL).toBe("placeholder-database-url");
    expect(parsed.AUDIT_DAILY_COST_LIMIT).toBe(100);
    expect(parsed.AUDIT_PER_IP_RATE_LIMIT).toBe(10);
  });

  it("rejects a missing NEXT_PUBLIC_SITE_URL", () => {
    const { success, error } = combinedEnvSchema.safeParse({
      ...completeEnv,
      NEXT_PUBLIC_SITE_URL: undefined,
    });
    expect(success).toBe(false);
    expect(error?.issues[0]?.path).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("rejects an invalid REDIS_URL", () => {
    const { success, error } = combinedEnvSchema.safeParse({
      ...completeEnv,
      REDIS_URL: "not-redis",
    });
    expect(success).toBe(false);
    expect(error?.issues[0]?.path).toEqual(["REDIS_URL"]);
  });

  it("rejects a non-finite AUDIT_DAILY_COST_LIMIT", () => {
    const { success, error } = combinedEnvSchema.safeParse({
      ...completeEnv,
      AUDIT_DAILY_COST_LIMIT: "Infinity",
    });
    expect(success).toBe(false);
    expect(error?.issues[0]?.path).toEqual(["AUDIT_DAILY_COST_LIMIT"]);
  });

  it("rejects a negative AUDIT_PER_IP_RATE_LIMIT", () => {
    const { success, error } = combinedEnvSchema.safeParse({
      ...completeEnv,
      AUDIT_PER_IP_RATE_LIMIT: "-1",
    });
    expect(success).toBe(false);
    expect(error?.issues[0]?.path).toEqual(["AUDIT_PER_IP_RATE_LIMIT"]);
  });

  it("treats empty optional provider credentials as absent", () => {
    const parsed = combinedEnvSchema.parse({
      ...completeEnv,
      DATAFORSEO_API_KEY: "",
      GOOGLE_CLIENT_SECRET: "",
    });
    expect(parsed.DATAFORSEO_API_KEY).toBeUndefined();
    expect(parsed.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });
});

describe("public vs server schema separation", () => {
  it("public schema contains only the two NEXT_PUBLIC_* variables", () => {
    const publicShape = publicEnvSchema.shape;
    expect(Object.keys(publicShape)).toEqual([
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_ANALYTICS_ID",
    ]);
  });

  it("server schema contains the other 18 variables", () => {
    const serverShape = serverEnvSchema.shape;
    expect(Object.keys(serverShape)).toHaveLength(18);
    expect(serverShape).not.toHaveProperty("NEXT_PUBLIC_SITE_URL");
    expect(serverShape).not.toHaveProperty("NEXT_PUBLIC_ANALYTICS_ID");
  });

  it("client module re-exports the same public schema", () => {
    expect(clientPublicEnvSchema).toBe(publicEnvSchema);
  });
});

describe("process-scoped schemas", () => {
  it("web schema does not require DATABASE_URL or REDIS_URL", () => {
    const parsed = webEnvSchema.parse({
      NEXT_PUBLIC_SITE_URL: "https://seovista.com",
      NEXTG_API_URL: "http://localhost:3101",
    });
    expect(parsed.NEXT_PUBLIC_SITE_URL).toBe("https://seovista.com");
    expect(parsed).not.toHaveProperty("DATABASE_URL");
  });

  it("worker schema requires DATABASE_URL and REDIS_URL", () => {
    expect(() =>
      workerEnvSchema.parse({
        NEXT_PUBLIC_SITE_URL: "https://seovista.com",
        NEXTG_API_URL: "http://localhost:3101",
      }),
    ).toThrow();
  });
});

describe("validateEnv", () => {
  it("returns parsed env and empty diagnostics on success", () => {
    const { env, diagnostics } = validateEnv(completeEnv);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://seovista.com");
    expect(diagnostics).toEqual([]);
  });

  it("throws EnvValidationError with redacted field diagnostics on failure", () => {
    try {
      validateEnv({ ...completeEnv, DATABASE_URL: "" });
      expect.fail("expected validation to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const err = error as EnvValidationError;
      expect(err.diagnostics.some((d) => d.includes("DATABASE_URL"))).toBe(true);
      expect(err.diagnostics.some((d) => d.includes("placeholder-database-url"))).toBe(false);
      expect(err.message).not.toContain("placeholder-database-url");
    }
  });
});

describe("validateWebEnv", () => {
  it("succeeds without worker connection strings", () => {
    const env = validateWebEnv({
      NEXT_PUBLIC_SITE_URL: "https://seovista.com",
      NEXTG_API_URL: "http://localhost:3101",
    });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://seovista.com");
  });
});

describe("validateWorkerEnv", () => {
  it("succeeds with all server variables", () => {
    const env = validateWorkerEnv(completeEnv);
    expect(env.DATABASE_URL).toBe("placeholder-database-url");
  });
});

describe("static server-only boundary", () => {
  it("server env module imports the server-only marker", () => {
    const serverSource = readFileSync(
      resolve(import.meta.dirname, "../env/server.ts"),
      "utf-8",
    );
    const indexSource = readFileSync(
      resolve(import.meta.dirname, "../env/index.ts"),
      "utf-8",
    );

    expect(serverSource).toContain('import "server-only";');
    expect(indexSource).toContain('import "server-only";');
  });

  it("client env module does not import server-only", () => {
    const clientSource = readFileSync(
      resolve(import.meta.dirname, "../env/client.ts"),
      "utf-8",
    );
    expect(clientSource).not.toContain('import "server-only";');
    expect(clientSource).not.toContain("server-only");
  });
});
