import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import console from "node:console";
import { checkNextgHealth } from "./health.js";

const port: number = Number(process.env.PORT) || 3101;

export function startServer(): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/health" || req.url === "/health/live" || req.url === "/health/ready") {
      const report = checkNextgHealth();
      const isReady = req.url === "/health/ready" ? report.readiness === "ready" : true;
      const status = isReady ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("nextg mock");
  });

  server.listen(port, () => {
    console.log(`nextg mock server listening on port ${port}`);
  });

  return server;
}

startServer();
