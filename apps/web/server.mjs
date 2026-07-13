import { createServer } from "http";
import next from "next";
import { buildSecurityHeaders } from "@seovista/seo-core/security/headers";

const PORT = Number(process.env.PORT ?? 3100);

const dev = false;
const app = next({ dev });
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
