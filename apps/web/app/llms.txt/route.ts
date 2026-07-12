import { NextResponse } from "next/server";

export function GET(): NextResponse {
  const body = `# SeoVista

AI visibility and GEO readiness platform.

## Overview

SeoVista helps teams measure and improve their visibility in generative engine and traditional search results.
`;
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
