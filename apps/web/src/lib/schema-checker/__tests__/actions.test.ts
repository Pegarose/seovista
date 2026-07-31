import { describe, expect, it, vi } from "vitest";
import { validateSchemaInput } from "../validation";

const { mockGetAdminDb, mockCheckIpRateLimit, mockSubmitSchemaAudit } = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
  mockSubmitSchemaAudit: vi.fn(),
}));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  submitSchemaAudit: mockSubmitSchemaAudit,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { startSchemaAuditAction } from "../actions";

describe("validateSchemaInput", () => {
  it("validates url format", () => {
    const valid = validateSchemaInput("https://example.com");
    expect(valid.success).toBe(true);

    const invalid = validateSchemaInput("invalid-url");
    expect(invalid.success).toBe(false);
  });

  it("accepts public http/https hosts", () => {
    expect(validateSchemaInput("https://example.com/page?q=1").success).toBe(true);
    expect(validateSchemaInput("http://blog.example.org").success).toBe(true);
    expect(validateSchemaInput("https://8.8.8.8").success).toBe(true);
  });

  it("rejects non-http(s) protocols", () => {
    expect(validateSchemaInput("file:///etc/passwd").success).toBe(false);
    expect(validateSchemaInput("ftp://example.com/file").success).toBe(false);
    expect(validateSchemaInput("javascript:alert(1)").success).toBe(false);
  });

  it("rejects loopback and unspecified IPv4 across the full ranges", () => {
    expect(validateSchemaInput("http://127.0.0.1").success).toBe(false);
    expect(validateSchemaInput("http://127.0.0.2").success).toBe(false);
    expect(validateSchemaInput("http://127.255.255.254").success).toBe(false);
    expect(validateSchemaInput("http://0.0.0.0").success).toBe(false);
  });

  it("rejects private, link-local and metadata IPv4 ranges", () => {
    expect(validateSchemaInput("http://10.0.0.1").success).toBe(false);
    expect(validateSchemaInput("http://192.168.1.1").success).toBe(false);
    // Full 172.16.0.0/12 range, not just 172.16.x.x
    expect(validateSchemaInput("http://172.16.0.1").success).toBe(false);
    expect(validateSchemaInput("http://172.17.0.1").success).toBe(false);
    expect(validateSchemaInput("http://172.31.255.255").success).toBe(false);
    expect(validateSchemaInput("http://172.32.0.1").success).toBe(true);
    // Cloud metadata / link-local
    expect(validateSchemaInput("http://169.254.169.254/latest/meta-data").success).toBe(false);
    expect(validateSchemaInput("http://169.254.0.1").success).toBe(false);
    // Carrier-grade NAT
    expect(validateSchemaInput("http://100.64.0.1").success).toBe(false);
    // Multicast / reserved
    expect(validateSchemaInput("http://224.0.0.1").success).toBe(false);
    expect(validateSchemaInput("http://240.0.0.1").success).toBe(false);
  });

  it("rejects IPv6 loopback, ULA and link-local literals", () => {
    expect(validateSchemaInput("http://[::1]/").success).toBe(false);
    expect(validateSchemaInput("http://[::]/").success).toBe(false);
    expect(validateSchemaInput("http://[fc00::1]/").success).toBe(false);
    expect(validateSchemaInput("http://[fd12:3456::1]/").success).toBe(false);
    expect(validateSchemaInput("http://[fe80::1]/").success).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 loopback and private addresses", () => {
    expect(validateSchemaInput("http://[::ffff:127.0.0.1]/").success).toBe(false);
    expect(validateSchemaInput("http://[::ffff:10.0.0.1]/").success).toBe(false);
    expect(validateSchemaInput("http://[::ffff:169.254.169.254]/").success).toBe(false);
  });

  it("rejects internal-style hostnames", () => {
    expect(validateSchemaInput("http://localhost:3200").success).toBe(false);
    expect(validateSchemaInput("https://printer.local").success).toBe(false);
    expect(validateSchemaInput("https://service.internal").success).toBe(false);
    expect(validateSchemaInput("https://ad.corp").success).toBe(false);
  });
});

describe("startSchemaAuditAction admin db guard (B3)", () => {
  it("returns the existing system-error contract when DATABASE_URL is missing (getAdminDb throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const formData = new FormData();
    formData.set("url", "https://example.com");

    const result = await startSchemaAuditAction({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
    expect(mockSubmitSchemaAudit).not.toHaveBeenCalled();
  });
});
