import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import console from "node:console";
import { checkNextgHealth } from "./health.js";
import {
  isRegisteredCollection,
  buildCollectionResponse,
  buildCaseStudyError,
  buildUnknownCollectionError,
  STABLE_TIMESTAMP,
} from "./fixtures.js";
import { isPreviewAuthorized, type PreviewAuthorization, type ReadMode } from "@seovista/content-models";

const defaultPort: number = Number(process.env.PORT) || 3101;
const supportedLocales = ["en"] as const;
const defaultClock = (): Date => new Date(STABLE_TIMESTAMP);
const previewAuthorizations: Readonly<Record<string, PreviewAuthorization>> = Object.freeze({
  "preview-valid": {
    scope: "preview",
    issuedAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    tokenHash: "preview-valid",
  },
  "preview-expired": {
    scope: "preview",
    issuedAt: new Date("2026-05-01T00:00:00.000Z"),
    expiresAt: new Date("2026-06-01T00:00:00.000Z"),
    tokenHash: "preview-expired",
  },
  "preview-future": {
    scope: "preview",
    issuedAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    tokenHash: "preview-future",
  },
  "wrong-scope": {
    scope: "not-preview" as unknown as "preview",
    issuedAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    tokenHash: "wrong-scope",
  },
});

export interface NextgServerOptions {
  readonly now?: () => Date;
  readonly authorizePreview?: (request: IncomingMessage) => PreviewAuthorization | undefined;
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseMode(url: URL): "public" | "preview" | undefined {
  const mode = url.searchParams.get("mode");
  if (mode === null || mode === "public") return "public";
  return mode === "preview" ? "preview" : undefined;
}

function parseLocale(url: URL): string | undefined {
  const locale = url.searchParams.get("locale");
  if (locale === null) return "en";
  return supportedLocales.includes(locale as (typeof supportedLocales)[number]) ? locale : undefined;
}

function defaultPreviewAuthorizer(_request: IncomingMessage): PreviewAuthorization | undefined {
  return undefined;
}

/**
 * Deterministic fixture helper for tests only. The running mock defaults to
 * denial until an application injects its server-only authorization seam.
 */
export function fixturePreviewAuthorization(token: string): PreviewAuthorization | undefined {
  return previewAuthorizations[token];
}

function effectiveMode(
  requestedMode: "public" | "preview",
  request: IncomingMessage,
  options: Required<NextgServerOptions>,
): ReadMode {
  if (requestedMode !== "preview") return { kind: "public", now: options.now() };
  const authorization = options.authorizePreview(request);
  const previewMode: ReadMode = authorization
    ? { kind: "preview", now: options.now(), authorization }
    : { kind: "public", now: options.now() };
  return isPreviewAuthorized(previewMode) ? previewMode : { kind: "public", now: options.now() };
}

function setJsonHeaders(res: ServerResponse, status: number): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  });
}

export function handleRequest(req: IncomingMessage, res: ServerResponse, providedOptions: NextgServerOptions = {}): void {
  const options: Required<NextgServerOptions> = {
    now: providedOptions.now ?? defaultClock,
    authorizePreview: providedOptions.authorizePreview ?? defaultPreviewAuthorizer,
  };
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/health" || url.pathname === "/health/live" || url.pathname === "/health/ready") {
    const report = checkNextgHealth();
    const isReady = url.pathname === "/health/ready" ? report.readiness === "ready" : true;
    const status = isReady ? 200 : 503;
    setJsonHeaders(res, status);
    res.end(JSON.stringify(report));
    return;
  }

  const match = /^\/api\/([a-zA-Z0-9-]+)\/?$/.exec(url.pathname);
  if (!match) {
    setJsonHeaders(res, 404);
    res.end(JSON.stringify({ error: "Not found", code: "NOT_FOUND" }));
    return;
  }

  const collection = match[1] ?? "";

  if (collection === "caseStudies") {
    setJsonHeaders(res, 422);
    res.end(JSON.stringify(buildCaseStudyError()));
    return;
  }

  if (!isRegisteredCollection(collection)) {
    setJsonHeaders(res, 404);
    res.end(JSON.stringify(buildUnknownCollectionError(collection)));
    return;
  }

  const requestedMode = parseMode(url);
  if (!requestedMode) {
    setJsonHeaders(res, 400);
    res.end(JSON.stringify({ error: "Invalid request.", code: "INVALID_MODE" }));
    return;
  }
  const locale = parseLocale(url);
  if (!locale) {
    setJsonHeaders(res, 400);
    res.end(JSON.stringify({ error: "Invalid request.", code: "UNSUPPORTED_LOCALE" }));
    return;
  }
  const mode = effectiveMode(requestedMode, req, options);
  const response = buildCollectionResponse(collection, mode.kind, locale, STABLE_TIMESTAMP);
  setJsonHeaders(res, 200);
  res.end(JSON.stringify(response));
}

export function startServer(overridePort?: number, options: NextgServerOptions = {}): ReturnType<typeof createServer> {
  const server = createServer((req, res) => handleRequest(req, res, options));
  const listenPort = overridePort ?? defaultPort;
  server.listen(listenPort, () => {
    console.log(`nextg mock server listening on port ${listenPort}`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startServer();
}
