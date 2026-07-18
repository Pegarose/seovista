import { describe, expect, it } from "vitest";
import { createPasswordHash, hashSessionToken, verifyPassword } from "../password";

describe("admin password and token helpers", () => {
  it("verifies scrypt hashes and rejects wrong credentials", () => {
    const encoded = createPasswordHash("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", encoded)).toBe(true);
    expect(verifyPassword("wrong password", encoded)).toBe(false);
    expect(encoded).not.toContain("correct horse battery staple");
  });

  it("creates deterministic one-way token hashes", () => {
    expect(hashSessionToken("session-token")).toBe(hashSessionToken("session-token"));
    expect(hashSessionToken("session-token")).not.toBe("session-token");
  });
});
