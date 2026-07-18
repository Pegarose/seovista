import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Set the base URL BEFORE importing the module (import.meta.env is read at module init).
vi.stubEnv("VITE_SEOVISTA_API_BASE", "https://api.test.local");

const { fetchCollection } = await import("./client");

const okResponse = (items: unknown[] = []) => ({
  collection: "articles",
  mode: "public" as const,
  locale: "en",
  items,
  generatedAt: "2026-01-01T00:00:00.000Z",
  total: items.length,
});

const publishedEntity = {
  id: "a1",
  collection: "articles",
  provenance: {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "published",
    locale: "en",
    version: 1,
  },
  title: "Test",
};

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchCollection — scenarios driving skeleton/empty/error states", () => {
  it("returns ok with items on successful published response (drives populated ledger)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(okResponse([publishedEntity])), {
          status: 200,
        }),
      ),
    );
    const res = await fetchCollection("articles");
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.items).toHaveLength(1);
  });

  it("returns ok with zero items when backend has no published entries (drives EmptyState)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(okResponse([])), { status: 200 })),
    );
    const res = await fetchCollection("articles");
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.items).toHaveLength(0);
  });

  it("strips non-published entities defensively", async () => {
    const draft = { ...publishedEntity, id: "a2", provenance: { ...publishedEntity.provenance, status: "draft" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(okResponse([publishedEntity, draft])), { status: 200 }),
      ),
    );
    const res = await fetchCollection("articles");
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.items).toHaveLength(1);
      expect(res.items[0].id).toBe("a1");
    }
  });

  it("returns unavailable/error on non-2xx (drives UnavailableState)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const res = await fetchCollection("articles");
    expect(res).toEqual({ status: "unavailable", reason: "error", code: "500" });
  });

  it("returns unavailable/network when fetch throws (drives UnavailableState)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const res = await fetchCollection("articles");
    expect(res).toEqual({ status: "unavailable", reason: "network" });
  });

  it("returns unavailable/invalid when payload shape is wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 200 })),
    );
    const res = await fetchCollection("articles");
    expect(res).toEqual({ status: "unavailable", reason: "invalid" });
  });

  it("refuses forbidden client collections without hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // @ts-expect-error — deliberately passing a forbidden collection to exercise the guard.
    const res = await fetchCollection("caseStudies");
    expect(res).toEqual({
      status: "unavailable",
      reason: "error",
      code: "FORBIDDEN_CLIENT_COLLECTION",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
