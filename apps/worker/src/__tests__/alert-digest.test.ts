import { describe, it, expect, vi } from "vitest";
import { createMockEmail } from "@seovista/reports";
import { noopLogger } from "../utils/logger.js";
import { runAlertDigest } from "../alerts/alert-digest.js";
import type { UnsentAlertRow } from "../db/tracker-repository.js";

function row(overrides: Partial<UnsentAlertRow> = {}): UnsentAlertRow {
  return {
    alertId: "a1",
    sessionId: "s1",
    email: "user@example.com",
    token: "11111111-1111-1111-1111-111111111111",
    created_at: new Date("2026-08-03T03:00:00.000Z"),
    kind: "dropped_out_of_top10",
    from_position: 4,
    to_position: 0,
    keyword: "seo denetimi",
    domain: "example.com",
    alert_consent_updated_at: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("runAlertDigest", () => {
  it("groups alerts by session into one email and marks them emailed", async () => {
    const email = createMockEmail();
    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
    const rows = [
      row({ alertId: "a1", sessionId: "s1", email: "a@example.com", kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" }),
      row({ alertId: "a2", sessionId: "s1", email: "a@example.com", kind: "significant_rise", from_position: 8, to_position: 3, keyword: "sem", domain: "a.com" }),
      row({ alertId: "a3", sessionId: "s2", email: "b@example.com", kind: "entered_top10", from_position: 0, to_position: 2, keyword: "seo", domain: "b.com" }),
    ];
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => rows, markAlertsEmailed },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });

    expect(result.sessionsNotified).toBe(2);
    expect(result.alertsEmailed).toBe(3);
    expect(markAlertsEmailed).toHaveBeenCalledWith(["a1", "a2", "a3"]);
    expect(email.getSideEffectCounts().successful).toBe(2);
  });

  it("builds Turkish text body with the panel link", async () => {
    const email = createMockEmail();
    const captured: string[] = [];
    const originalSend = email.send.bind(email);
    email.send = async (payload) => {
      captured.push(payload.textBody);
      return originalSend(payload);
    };
    await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [row({ kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" })], markAlertsEmailed: vi.fn() },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(captured[0]).toContain('"seo" (a.com): İlk 10dan düştü (önceki #4)');
    expect(captured[0]).toContain("https://seovista.example/tracker/11111111-1111-1111-1111-111111111111");
  });

  it("does not send when there are no unsent alerts", async () => {
    const email = createMockEmail();
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [], markAlertsEmailed: vi.fn() },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.sessionsNotified).toBe(0);
    expect(email.getSideEffectCounts().attempted).toBe(0);
  });

  it("keeps emailed_at NULL and counts a failure when the provider errors", async () => {
    const email = createMockEmail({ capability: "unconfigured" }); // always fails
    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [row()], markAlertsEmailed },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.failures).toBe(1);
    expect(markAlertsEmailed).not.toHaveBeenCalled();
  });
});
