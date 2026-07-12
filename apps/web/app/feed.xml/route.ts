import { NextResponse } from "next/server";

export function GET(): NextResponse {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>SeoVista Insights</title>
  <link href="https://seovista.example/"/>
  <updated>${new Date().toISOString()}</updated>
  <id>https://seovista.example/</id>
</feed>
`;
  return new NextResponse(body, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}
