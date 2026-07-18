import { createFileRoute } from "@tanstack/react-router";

// Empty but valid Atom feed. Populated once Insights has published articles.
export const Route = createFileRoute("/feed.xml")({
  server: {
    handlers: {
      GET: () => {
        const now = new Date().toISOString();
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>SeoVista Insights</title>
  <subtitle>Editorial research on GEO, SEO, and digital authority.</subtitle>
  <id>urn:seovista:insights</id>
  <updated>${now}</updated>
</feed>
`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/atom+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
