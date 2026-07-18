import { describe, expect, it } from "vitest";
import { safeAdminReturnPath } from "../return-path";

describe("safe admin return paths", () => {
  it("allows only internal admin paths", () => {
    expect(safeAdminReturnPath("/admin/jobs")).toBe("/admin/jobs");
    expect(safeAdminReturnPath("https://evil.example")).toBe("/admin/");
    expect(safeAdminReturnPath("//evil.example/admin")).toBe("/admin/");
    expect(safeAdminReturnPath("/admin\\evil")).toBe("/admin/");
  });
});
