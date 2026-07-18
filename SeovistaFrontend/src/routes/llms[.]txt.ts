import { createFileRoute } from "@tanstack/react-router";

// llms.txt: a human-readable summary of what this site is about. It is not a
// ranking mechanism and does not promise inclusion in any AI system.
const BODY = `# SeoVista

An editorial intelligence lab focused on Generative Engine Optimization (GEO),
traditional SEO, and digital authority.

Currently in foundation stage (Sprint 0). Editorial content only; no live
audit platform, no live citation tracker, no customer portal.

## Sections
- /geo/ — Generative Engine Optimization
- /seo/ — Search Engine Optimization
- /digital-authority/ — Digital Authority
- /tools/ — Tools library (foundation stage)
- /tools/geo-readiness-checker/ — Non-operational tool brief
- /insights/ — Editorial research
- /about/ — About SeoVista
- /contact/ — Contact by email
`;

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(BODY, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
