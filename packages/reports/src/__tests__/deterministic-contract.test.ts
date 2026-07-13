import { describe, expect, it, vi } from "vitest";
import { createMockEmail, createMockOAuth, createMockStorage, OAuthConfigurationError } from "../index.js";

const fixedClock = (): Date => new Date("2026-07-01T00:00:00.000Z");
const scenarios = ["unavailable", "authorization_denial", "rejection", "rate_limit", "malformed", "timeout", "cancellation"] as const;

describe("deterministic reports provider contract", () => {
  it("requires an injected OAuth identity source", () => {
    expect(() => createMockOAuth({} as never)).toThrow(OAuthConfigurationError);
  });

  it("covers storage success, not-found, expired, authorization denial, every finite failure, and side effects", async () => {
    const storage = createMockStorage({ now: fixedClock });
    const put = await storage.signedPut({ key: "report.pdf", contentType: "application/pdf", expiresInSeconds: 60, scenario: "success" });
    expect(put).toMatchObject({ capability: "mock", success: true, value: { key: "report.pdf", expiresAt: "2026-07-01T00:01:00.000Z" } });
    expect(await storage.signedGet({ key: "missing.pdf", expiresInSeconds: 60, scenario: "not_found" })).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
    expect(await storage.signedGet({ key: "report.pdf", expiresInSeconds: 60, scenario: "expired" })).toMatchObject({ success: false, error: { code: "EXPIRED" } });
    expect(await storage.signedGet({ key: "report.pdf", expiresInSeconds: 60, scenario: "unauthorized" })).toMatchObject({ success: false, error: { code: "AUTHORIZATION_DENIED" } });
    for (const scenario of scenarios) {
      expect(await storage.signedPut({ key: "report.pdf", contentType: "application/pdf", expiresInSeconds: 60, scenario })).toMatchObject({ success: false, scenario });
    }
    expect(storage.getSideEffectCounts()).toEqual({ attempted: 11, successful: 1 });
  });

  it("uses injected identity and time for OAuth state, exchange, refresh, expiry, and finite failure scenarios", async () => {
    let sequence = 0;
    const oauth = createMockOAuth({ now: fixedClock, identity: () => `id-${++sequence}` });
    const state = await oauth.createState({ provider: "google", redirectUri: "https://seovista.com/auth/callback/", scopes: ["read"], scenario: "success" });
    expect(state).toMatchObject({ success: true, value: { state: "id-1", expiresAt: "2026-07-01T00:10:00.000Z" } });
    const exchange = await oauth.exchange({ code: "code", state: state.value?.state ?? "", redirectUri: "https://seovista.com/auth/callback/", scenario: "success" });
    expect(exchange).toMatchObject({ success: true, value: { accessToken: "id-2", refreshToken: "id-3", expiresAt: "2026-07-01T01:00:00.000Z" } });
    expect(await oauth.refresh({ refreshToken: exchange.value?.refreshToken ?? "", scenario: "success" })).toMatchObject({ success: true, value: { accessToken: "id-4" } });
    expect(await oauth.exchange({ code: "code", state: "missing", redirectUri: "https://seovista.com/auth/callback/", scenario: "success" })).toMatchObject({ success: false, error: { code: "INVALID_STATE" } });
    for (const scenario of scenarios) {
      expect(await oauth.createState({ provider: "google", redirectUri: "https://seovista.com/auth/callback/", scopes: ["read"], scenario })).toMatchObject({ success: false, scenario });
    }
    expect(oauth.getSideEffectCounts()).toEqual({ attempted: 11, successful: 3 });
  });

  it("preserves consent/source/UTM, deduplicates, fails closed for invalid capability, and makes no network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("outbound network denied"));
    const email = createMockEmail({ now: fixedClock });
    const payload = {
      to: { email: "person@example.com" },
      from: { email: "noreply@seovista.com" },
      subject: "Your report",
      textBody: "Report is ready",
      consent: { marketing: true, analytics: false, timestamp: fixedClock().toISOString() },
      source: "website",
      utm: { source: "search", campaign: "launch" },
      scenario: "success" as const,
      intent: "report-request",
    };
    const first = await email.send(payload);
    const duplicate = await email.send(payload);
    expect(first).toMatchObject({ success: true, value: { accepted: ["person@example.com"], deduplicated: false, messageId: expect.stringContaining("2026-07-01T00:00:00.000Z") } });
    expect(duplicate).toMatchObject({ success: true, value: { accepted: [], deduplicated: true } });
    for (const scenario of scenarios) {
      expect(await email.send({ ...payload, scenario })).toMatchObject({ success: false, scenario });
    }
    expect(email.getSideEffectCounts()).toEqual({ attempted: 9, successful: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();

    const invalid = createMockEmail({ capability: "live" as never, now: fixedClock });
    expect(await invalid.send(payload)).toMatchObject({ capability: "unconfigured", success: false, error: { code: "UNCONFIGURED" } });
    fetchSpy.mockRestore();
  });
});
