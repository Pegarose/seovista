export { createDbClient, checkDbConnection, type DbClient } from "./client.js";
export { createMigrationRunner, defaultMigrationsDir, type Migration } from "./migrations.js";
export {
  createMigrationRunner as createEnhancedMigrationRunner,
  type MigrationRunner,
  type MigrationState,
  type MigrationApplyResult,
  type MigrationStatus,
  type MigrationLedgerRow,
} from "./migration-runner.js";
export { createTenantRepository, type TenantRepository, type Organization, type Workspace, type WorkspaceMembership as TenantWorkspaceMembership, type Project } from "./tenant.js";
export {
  evaluateAuthorization,
  createAuthorizationRepository,
  isAllowed,
  canRead,
  minimumRoleForCapability,
  roleHasCapability,
  type AuthorizationDecision,
  type AuthorizationContext,
  type AuthorizationRepository,
  type ProjectOwnershipResult,
  type WorkspaceRole,
  type Capability,
} from "./tenant-auth.js";
export {
  DEFAULT_ADMIN_DISPLAY_NAME,
  DEFAULT_ADMIN_EMAIL,
  ensureAdminBootstrap,
  runLocalAdminBootstrap,
  verifyAdminPasswordHash,
  type AdminBootstrapResult,
  type LocalAdminBootstrapDependencies,
  type LocalAdminBootstrapEnvironment,
  type LocalAdminBootstrapResult,
} from "./admin-seed.js";
export {
  createGeoAuditRepository,
  type GeoAuditLeadRow,
  type AdminLeadListRow,
  type GeoAuditJobRecord,
} from "./geo-audit-repository.js";
export {
  createJobRepository,
  createJobResultRepository,
  type JobRecord,
  type JobResult,
  type JobStatus,
  type TerminalClass,
} from "./job.js";
export { createRbacRepository, type Role, type Permission } from "./rbac.js";
export { createAuditRepository, sanitizeAuditMetadata, type AuditEvent } from "./audit.js";
export { createCostRepository, type CostRecord } from "./cost.js";
export {
  createCmsRepository,
  type CmsEntryRow,
  type PublishedInsightListRow,
  type PublishedInsightDetail,
  type AdminInsightListRow,
  type AdminInsightDetail,
} from "./cms-repository.js";
export { readAdminOverview, type AdminOverview, type OverviewDependencyStatus } from "./admin-overview.js";
export {
  createAdminAuthRepository,
  type AdminUser,
  type AdminSession,
  type AdminSessionWithUser,
  type AdminUserStatus,
  type CreateAdminUser,
  type CreateAdminSession,
} from "./admin-auth.js";
export {
  createTrackerRepository,
  type ActiveTarget,
  type TargetWithObservations,
  type SessionInfo,
} from "./tracker-repository.js";
