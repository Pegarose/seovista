import { createServer } from "http";
import next from "next";
import { buildSecurityHeaders } from "@seovista/seo-core/security/headers";

const PORT = Number(process.env.PORT ?? 3100);
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://seovista.com";

const PUBLIC_SLASHED_ROUTES = new Set([
  "/geo/",
  "/seo/",
  "/digital-authority/",
  "/tools/",
  "/tools/geo-readiness-checker/",
  "/about/",
  "/contact/",
  "/insights/",
  "/privacy/",
  "/cookies/",
  "/terms/",
]);

const dev = false;
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    for (const { key, value } of buildSecurityHeaders()) {
      res.setHeader(key, value);
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${PORT}`}`);
    const pathname = url.pathname;

    // Only the public launch routes without a trailing slash get a 301 to the
    // canonical trailing-slash variant. This satisfies the SEO slash-matrix
    // requirement while leaving Next.js trailingSlash: true in charge of the
    // final canonical response.
    if (pathname !== "/" && !pathname.endsWith("/")) {
      const slashed = `${pathname}/`;
      if (PUBLIC_SLASHED_ROUTES.has(slashed)) {
        res.writeHead(301, { Location: `${siteUrl}${slashed}` });
        res.end();
        return;
      }
    }

    handle(req, res);
  }).listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
