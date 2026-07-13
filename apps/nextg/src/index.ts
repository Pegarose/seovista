export { startServer, handleRequest, readBody } from "./server.js";
export { checkNextgHealth, type NextgHealthReport } from "./health.js";
export {
  allFixtures,
  getFixturesForCollection,
  buildCollectionResponse,
  buildCaseStudyError,
  buildUnknownCollectionError,
  isRegisteredCollection,
  registeredCollections,
  validateRegisteredCollections,
  STABLE_TIMESTAMP,
} from "./fixtures.js";
export type {
  RegisteredCollection,
  RawEntity,
  RawCollectionResponse,
  RawErrorResponse,
  RawPublicationStatus,
  RawProvenance,
  RawIndexation,
  RawBaseContent,
} from "./types.js";

export const name: string = "@seovista/nextg";
