import { loadWebEnv } from "@seovista/seo-core/env";

export function register(): void {
  // Validate the web-process environment at server boot. This runs in the
  // server runtime, so it never executes in the browser bundle. The
  // validation rejects malformed required settings and emits field-specific
  // redacted diagnostics without echoing secret values.
  loadWebEnv();
}
