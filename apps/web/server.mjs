import { createServer } from "http";
import next from "next";
import { buildSecurityHeaders } from "@seovista/seo-core/security/headers";

const PORT = Number(process.env.PORT ?? 3200);
const DIST_DIR = process.env.NEXT_DIST_DIR ?? ".next";
const PROJECT_DIR = process.env.NEXT_PROJECT_DIR ?? ".";

const dev = false;
const app = next({ dev, dir: PROJECT_DIR, conf: { distDir: DIST_DIR } });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    for (const { key, value } of buildSecurityHeaders()) {
      res.setHeader(key, value);
    }

    handle(req, res);
  }).listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
