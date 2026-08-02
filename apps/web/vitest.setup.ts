import "@testing-library/jest-dom/vitest";

// React 19 requires this flag before `act` (used by @testing-library/react)
// may run in a test environment.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// Vitest does not auto-load .env files. Several server actions guard on
// REDIS_URL being present (even though the Redis client is mocked in unit
// tests). Provide a deterministic fallback so those guards don't short-
// circuit the action under test into the generic system-error branch.
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:8637/0";
}
