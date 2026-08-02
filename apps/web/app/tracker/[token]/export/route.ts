import { listTrackerTargetsAction } from "../../../../src/lib/tracker/actions";
import type { TargetWithObservations } from "@seovista/worker";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CSV_HEADER = "keyword;domain;date;position;top_competitors";
const BOM = "\uFEFF";

function escapeCsvField(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function buildCsv(targets: TargetWithObservations[]): string {
  const rows: string[] = [CSV_HEADER];

  for (const target of targets) {
    // Observations are DESC from the repository; reverse to ASC for chronological CSV
    const obs = [...target.recentObservations].reverse();
    for (const o of obs) {
      const date = formatDate(o.checkedAt);
      const position = String(o.position);
      const competitors = o.topCompetitors
        .map((c) => `${c.domain}(#${c.rank})`)
        .join(",");
      rows.push(
        [
          escapeCsvField(target.keyword),
          escapeCsvField(target.domain),
          date,
          position,
          competitors,
        ].join(";"),
      );
    }
  }

  return BOM + rows.join("\n") + "\n";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return new Response(null, { status: 404 });
  }

  const result = await listTrackerTargetsAction(token);

  if (!result.success) {
    return new Response(null, { status: 404 });
  }

  const csv = buildCsv(result.targets);
  const dateStr = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seovista-takip-${dateStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
