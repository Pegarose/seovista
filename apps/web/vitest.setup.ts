import "@testing-library/jest-dom/vitest";

// React 19 requires this flag before `act` (used by @testing-library/react)
// may run in a test environment.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
