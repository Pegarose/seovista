import { describe, it, expect } from "vitest";
import { getGeoWorkerConcurrency } from "../queue/geo-worker.js";

describe("GeoWorker Concurrency", () => {
  it("defaults to 3 concurrent jobs when no option or env is set", () => {
    const concurrency = getGeoWorkerConcurrency({});
    expect(concurrency).toBe(3);
  });

  it("respects GEO_WORKER_CONCURRENCY environment variable", () => {
    const concurrency = getGeoWorkerConcurrency({}, { GEO_WORKER_CONCURRENCY: "5" });
    expect(concurrency).toBe(5);
  });

  it("prioritizes options.concurrency over environment variable", () => {
    const concurrency = getGeoWorkerConcurrency({ concurrency: 10 }, { GEO_WORKER_CONCURRENCY: "5" });
    expect(concurrency).toBe(10);
  });
});
