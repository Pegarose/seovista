import { NextResponse, type NextRequest } from "next/server";
import { env } from "node:process";

export interface WebHealthReport {
  name: string;
  liveness: "live" | "dead";
  readiness: "ready" | "not_ready";
  dependencies: { name: string; status: "up" | "down" | "unknown"; error?: string }[];
  timestamp: string;
}

async function checkNextgMock(): Promise<{ name: string; status: "up" | "down" | "unknown"; error?: string }> {
  const nextgUrl = env.NEXTG_API_URL ?? "http://localhost:3101";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${nextgUrl}/health/ready`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return { name: "nextg-mock", status: response.ok ? "up" : "down" };
  } catch (error) {
    return {
      name: "nextg-mock",
      status: "down",
      error: error instanceof Error ? error.name : "unknown",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const nextg = await checkNextgMock();
  const ready = nextg.status === "up";

  const report: WebHealthReport = {
    name: "@seovista/web",
    liveness: "live",
    readiness: ready ? "ready" : "not_ready",
    dependencies: [nextg],
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(report, { status: ready ? 200 : 503 });
}

export async function HEAD(): Promise<NextResponse> {
  const nextg = await checkNextgMock();
  const ready = nextg.status === "up";

  return new NextResponse(null, {
    status: ready ? 200 : 503,
    headers: { "Content-Type": "application/json" },
  });
}
