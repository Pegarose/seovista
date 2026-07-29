/**
 * Provider selection layer.
 *
 * Every server consumer that needs a search visibility provider goes
 * through the factory. Client code must never import from this module.
 */

export {
  createSearchVisibilityProvider,
  type ProviderMode,
  type ProviderSelectionContext,
} from "./provider-factory.js";
