import { describe, expect, it } from "vitest";
import { readAdminOverview } from "../db/admin-overview.js";

function clientFor(rows: Array<{ rows: unknown[] }>) {
  let index = 0;
  return {
    query: async () => rows[index++] ?? { rows: [] },
  } as never;
}

describe("admin overview read model", () => {
  it("aggregates bounded operational data without exposing raw secrets", async () => {
    const overview = await readAdminOverview(
      clientFor([
        { rows: [{ count: 2 }] },
        { rows: [{ status: "completed", count: 3 }, { status: "failed", count: 1 }] },
        { rows: [{ count: 4 }] },
        { rows: [{ amount: "1.250000" }] },
        { rows: [{ action: "admin.login", actor_identity: "user-1", outcome: "success", recorded_at: new Date("2026-07-16T10:00:00Z") }] },
      ]),
      new Date("2026-07-16T12:00:00Z"),
    );

    expect(overview.activeAdminUsers).toBe(2);
    expect(overview.jobCounts).toEqual({ completed: 3, failed: 1 });
    expect(overview.auditEventsToday).toBe(4);
    expect(overview.apiCostToday).toBe("1.250000");
    expect(overview.recentActivity).toHaveLength(1);
    expect(JSON.stringify(overview)).not.toContain("password");
    expect(JSON.stringify(overview)).not.toContain("token");
  });
});
