export type {
  ProviderCapability,
  ProviderScenario,
  ProviderOutcome,
  ProviderError,
  ProviderSideEffectCounts,
  UtmParams,
  ConsentState,
} from "./types.js";

export {
  createMockStorage,
  createUnconfiguredStorage,
  type StorageProvider,
  type StorageScenario,
  type SignedPutRequest,
  type SignedPutResult,
  type SignedGetRequest,
  type SignedGetResult,
  type MockStorageOptions,
} from "./storage.js";

export {
  createMockEmail,
  createUnconfiguredEmail,
  type EmailProvider,
  type EmailScenario,
  type EmailAddress,
  type EmailPayload,
  type EmailResult,
  type MockEmailOptions,
} from "./email.js";

export {
  createMockOAuth,
  createUnconfiguredOAuth,
  type OAuthProvider,
  type OAuthScenario,
  type OAuthStateRequest,
  type OAuthStateResult,
  type OAuthTokenRequest,
  type OAuthTokenResult,
  type OAuthRefreshRequest,
  type MockOAuthOptions,
  OAuthConfigurationError,
} from "./oauth.js";

export {
  createMockRenderer,
  createUnconfiguredRenderer,
  type ReportRenderer,
  type RenderScenario,
  type RenderRequest,
  type RenderResult,
  type MockRendererOptions,
} from "./renderer.js";

export {
  createMockSignedLinkProvider,
  createUnconfiguredSignedLinkProvider,
  type SignedLinkProvider,
  type SignedLinkScenario,
  type SignedLinkRequest,
  type SignedLinkResult,
  type MockSignedLinkOptions,
} from "./signed-link.js";

export const name: string = "@seovista/reports";
