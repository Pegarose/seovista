import { describe, it, expect } from "vitest";
import {
  createMockStorage,
  createUnconfiguredStorage,
  createMockEmail,
  createMockOAuth,
  createMockRenderer,
  createUnconfiguredRenderer,
  createMockSignedLinkProvider,
  createUnconfiguredSignedLinkProvider,
} from "../index.js";

describe("reports storage mock", () => {
  it("returns signed put URL for success", async () => {
    const storage = createMockStorage();
    const result = await storage.signedPut({ key: "report-1.pdf", contentType: "application/pdf", expiresInSeconds: 60, scenario: "success" });
    expect(result.success).toBe(true);
    expect(result.value?.url).toContain("mock-signed");
    expect(result.value?.key).toBe("report-1.pdf");
  });

  it("returns not found when object is missing", async () => {
    const storage = createMockStorage();
    const result = await storage.signedGet({ key: "missing.pdf", expiresInSeconds: 60, scenario: "not_found" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("returns expired for expired signed URL", async () => {
    const storage = createMockStorage();
    await storage.signedPut({ key: "report-2.pdf", contentType: "application/pdf", expiresInSeconds: 60, scenario: "success" });
    const result = await storage.signedGet({ key: "report-2.pdf", expiresInSeconds: 60, scenario: "expired" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("EXPIRED");
  });

  it("returns unauthorized for bad credentials", async () => {
    const storage = createMockStorage();
    const result = await storage.signedGet({ key: "report-3.pdf", expiresInSeconds: 60, scenario: "unauthorized" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("AUTHORIZATION_DENIED");
  });

  it("is unconfigured when capability is unconfigured", async () => {
    const storage = createUnconfiguredStorage();
    const result = await storage.signedPut({ key: "report-4.pdf", contentType: "application/pdf", expiresInSeconds: 60, scenario: "success" });
    expect(result.success).toBe(false);
    expect(result.capability).toBe("unconfigured");
  });
});

describe("reports email mock", () => {
  it("accepts email with marketing consent and preserves source/utm", async () => {
    const email = createMockEmail();
    const result = await email.send({
      to: { email: "user@example.com" },
      from: { email: "noreply@seovista.com" },
      subject: "Your GEO report",
      textBody: "Report is ready.",
      consent: { marketing: true, analytics: true, timestamp: "2026-07-01T00:00:00Z" },
      source: "landing-page",
      utm: { source: "newsletter", medium: "email", campaign: "sprint0" },
      scenario: "success",
      intent: "report delivery",
    });
    expect(result.success).toBe(true);
    expect(result.value?.redactedIntent).toBe("re***y");
    expect(result.value?.deduplicated).toBe(false);
  });

  it("rejects email without consent", async () => {
    const email = createMockEmail();
    const result = await email.send({
      to: { email: "user@example.com" },
      from: { email: "noreply@seovista.com" },
      subject: "Your GEO report",
      textBody: "Report is ready.",
      consent: { marketing: false, analytics: false, timestamp: "2026-07-01T00:00:00Z" },
      scenario: "success",
    });
    expect(result.success).toBe(false);
  });

  it("deduplicates identical emails", async () => {
    const email = createMockEmail();
    const payload = {
      to: { email: "user@example.com" },
      from: { email: "noreply@seovista.com" },
      subject: "Your GEO report",
      textBody: "Report is ready.",
      consent: { marketing: true, analytics: true, timestamp: "2026-07-01T00:00:00Z" },
      source: "landing-page",
      scenario: "success" as const,
    };
    const first = await email.send(payload);
    const second = await email.send(payload);
    expect(first.value?.deduplicated).toBe(false);
    expect(second.value?.deduplicated).toBe(true);
    expect(second.value?.accepted).toEqual([]);
  });
});

describe("reports OAuth mock", () => {
  it("creates state and exchanges code", async () => {
    const oauth = createMockOAuth();
    const state = await oauth.createState({
      provider: "google",
      redirectUri: "https://seovista.com/auth/callback/",
      scopes: ["read"],
      scenario: "success",
    });
    expect(state.success).toBe(true);
    const exchange = await oauth.exchange({
      code: "code-1",
      state: state.value?.state ?? "",
      redirectUri: "https://seovista.com/auth/callback/",
      scenario: "success",
    });
    expect(exchange.success).toBe(true);
    expect(exchange.value?.encryptedToken).toContain("enc:");
  });

  it("rejects exchange with mismatched redirect URI", async () => {
    const oauth = createMockOAuth();
    const state = await oauth.createState({
      provider: "google",
      redirectUri: "https://seovista.com/auth/callback/",
      scopes: ["read"],
      scenario: "success",
    });
    const exchange = await oauth.exchange({
      code: "code-1",
      state: state.value?.state ?? "",
      redirectUri: "https://evil.com/callback/",
      scenario: "success",
    });
    expect(exchange.success).toBe(false);
  });

  it("refreshes tokens with encrypted boundary", async () => {
    const oauth = createMockOAuth();
    const state = await oauth.createState({
      provider: "google",
      redirectUri: "https://seovista.com/auth/callback/",
      scopes: ["read"],
      scenario: "success",
    });
    const exchange = await oauth.exchange({
      code: "code-1",
      state: state.value?.state ?? "",
      redirectUri: "https://seovista.com/auth/callback/",
      scenario: "success",
    });
    const refresh = await oauth.refresh({ refreshToken: exchange.value?.refreshToken ?? "", scenario: "success" });
    expect(refresh.success).toBe(true);
    expect(refresh.value?.accessToken).not.toBe(exchange.value?.accessToken);
    expect(refresh.value?.encryptedToken).toContain("enc:");
  });
});

describe("reports renderer mock", () => {
  it("renders report content URL for success", async () => {
    const renderer = createMockRenderer();
    const result = await renderer.render({ reportId: "report-1", format: "html", scenario: "success" });
    expect(result.success).toBe(true);
    expect(result.value?.contentUrl).toContain("report-1.html");
  });

  it("returns unconfigured when renderer is not configured", async () => {
    const renderer = createUnconfiguredRenderer();
    const result = await renderer.render({ reportId: "report-1", format: "html", scenario: "success" });
    expect(result.success).toBe(false);
    expect(result.capability).toBe("unconfigured");
  });
});

describe("reports signed link mock", () => {
  it("creates signed link for success", async () => {
    const provider = createMockSignedLinkProvider();
    const result = await provider.createSignedLink({ reportId: "report-1", expiresInSeconds: 60, scenario: "success" });
    expect(result.success).toBe(true);
    expect(result.value?.url).toContain("signature=");
  });

  it("returns unconfigured when not configured", async () => {
    const provider = createUnconfiguredSignedLinkProvider();
    const result = await provider.createSignedLink({ reportId: "report-1", expiresInSeconds: 60, scenario: "success" });
    expect(result.success).toBe(false);
    expect(result.capability).toBe("unconfigured");
  });
});
