export const AUDIT_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function hasAuditPollingExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= AUDIT_POLL_TIMEOUT_MS;
}
