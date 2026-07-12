import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import console from 'node:console';

const port: number = Number(process.env.PORT) || 3101;

export function startServer(): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('nextg mock');
  });

  server.listen(port, () => {
    console.log(`nextg mock server listening on port ${port}`);
  });

  return server;
}

startServer();
