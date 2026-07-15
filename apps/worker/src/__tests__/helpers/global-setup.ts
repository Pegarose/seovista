import type { GlobalSetupContext } from "vitest/node";

const lifecycleContextProvideKey = "seovistaLifecycleContextPath";

declare module "vitest" {
  export interface ProvidedContext {
    seovistaLifecycleContextPath: string;
  }
}
import {
  resolveParentLifecycleContext,
  stopParentStack,
  type ParentStack,
} from "./test-env.js";

export const LIFECYCLE_CONTEXT_PROVIDE_KEY = lifecycleContextProvideKey;

interface GlobalSetupDependencies {
  resolveParent: () => Promise<ParentStack>;
  stopParent: (stack: ParentStack) => void;
}

export function createWorkerGlobalSetup(
  dependencies: GlobalSetupDependencies = {
    resolveParent: () => resolveParentLifecycleContext(),
    stopParent: stopParentStack,
  },
) {
  return async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
    const stack = await dependencies.resolveParent();
    provide(LIFECYCLE_CONTEXT_PROVIDE_KEY, stack.contextPath);

    return async () => {
      if (stack.ownsStack) dependencies.stopParent(stack);
    };
  };
}

export default createWorkerGlobalSetup();
