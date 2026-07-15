import { inject } from "vitest";
import {
  LIFECYCLE_CONTEXT_PROVIDE_KEY,
} from "./global-setup.js";
import { setProvidedLifecycleContextPath } from "./test-env.js";

const contextPath = inject(LIFECYCLE_CONTEXT_PROVIDE_KEY);
setProvidedLifecycleContextPath(contextPath);
