/**
 * Injected logger contract for CLI scripts and worker diagnostics.
 *
 * The ESLint `no-console` rule (`allow: ["error", "warn"]`) flags every
 * `console.log` call site. Instead of scattering `eslint-disable` comments,
 * every call site injects a `Logger` and the single sanctioned `console.log`
 * lives here in {@link stdoutLogger}. Tests inject {@link noopLogger} or a
 * `vi.fn()` to assert/suppress output.
 */
export type Logger = (...values: unknown[]) => void;

export const stdoutLogger: Logger = (...values) => {
  // eslint-disable-next-line no-console -- single sanctioned stdout wrapper; all other call sites inject a Logger so the no-console rule stays clean.
  console.log(...values);
};

export const noopLogger: Logger = () => {};
