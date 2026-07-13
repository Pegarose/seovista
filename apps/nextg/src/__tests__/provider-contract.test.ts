import { describe, expect, it } from "vitest";
import { handleRequest } from "../index.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const fixedClock = (): Date => new Date("2026-07-02T03:04:05.000Z");

function invoke(path: string): { status: number | undefined; payload: unknown } {
  let status: number | undefined;
  let serialized = "";
  const request = { url: path, headers: {} } as IncomingMessage;
  const response = {
    writeHead(code: number) {
      status = code;
    },
    end(value: string) {
      serialized = value;
    },
  } as unknown as ServerResponse;
  handleRequest(request, response, { now: fixedClock });
  return { status, payload: JSON.parse(serialized) as unknown };
}

describe("NextG deterministic mock provider contract", () => {
  it("uses the injected clock in generated collection and health snapshots", () => {
    const collection = invoke("/api/pages?mode=public&locale=en");
    const health = invoke("/health");
    expect(collection).toMatchObject({ status: 200, payload: { generatedAt: "2026-07-02T03:04:05.000Z" } });
    expect(health).toMatchObject({ status: 200, payload: { capability: "mock", timestamp: "2026-07-02T03:04:05.000Z" } });
  });
});
