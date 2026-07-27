import { describe, expect, it } from "vitest";
import { readPublishedInsights } from "../public-insights";

describe("public insights reader", () => {
  it("returns an empty published ledger without marking it unavailable", async () => {
    const result = await readPublishedInsights({
      getPublishedInsights: async () => [],
    });

    expect(result).toEqual({ insights: [], unavailable: false });
  });

  it("turns a database read failure into an unavailable empty ledger", async () => {
    const result = await readPublishedInsights({
      getPublishedInsights: async () => {
        throw new Error("database is unavailable");
      },
    });

    expect(result).toEqual({ insights: [], unavailable: true });
  });
});
