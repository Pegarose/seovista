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

const defaultPort: number = Number(process.env.PORT) || 3101;

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseMode(url: URL): "public" | "preview" {
  const mode = url.searchParams.get("mode");
  return mode === "preview" ? "preview" : "public";
}

function parseLocale(url: URL): string {
  const locale = url.searchParams.get("locale");
  return typeof locale === "string" && locale.length > 0 ? locale : "en";
}

function setJsonHeaders(res: ServerResponse, status: number): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  });
}

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
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

  const mode = parseMode(url);
  const locale = parseLocale(url);
  const response = buildCollectionResponse(collection, mode, locale, STABLE_TIMESTAMP);
  setJsonHeaders(res, 200);
  res.end(JSON.stringify(response));
}

export function startServer(overridePort?: number): ReturnType<typeof createServer> {
  const server = createServer(handleRequest);
  const listenPort = overridePort ?? defaultPort;
  server.listen(listenPort, () => {
    console.log(`nextg mock server listening on port ${listenPort}`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startServer();
}
