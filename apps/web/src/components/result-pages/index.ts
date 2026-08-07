/**
 * Result-Page Editorial Lab — shared kit.
 *
 * Barrel for the components and types every tool result page mounts. Later
 * tasks consume these exact signatures.
 */

export { ResultShell } from "./result-shell";
export type { ResultShellProps, AuditStatusForUi } from "./result-shell";

export { StatusPill } from "./status-pill";
export type { StatusPillProps, StatusPillVariant } from "./status-pill";

export { AuditMetaStrip } from "./audit-meta-strip";
export type { AuditMetaStripProps } from "./audit-meta-strip";

export { ReportErrorPanel } from "./report-error-panel";
export type { ReportErrorPanelProps } from "./report-error-panel";

export { VerdictCard } from "./verdict-card";
export type { VerdictCardProps, VerdictVariant } from "./verdict-card";

export { IssueLedger } from "./issue-ledger";
export type { IssueLedgerItem, IssueLedgerProps } from "./issue-ledger";

export { UnknownJobStatusView } from "./unknown-job-status-view";
