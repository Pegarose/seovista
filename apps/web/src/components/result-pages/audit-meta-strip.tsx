/**
 * Shared audit metadata strip for result pages.
 *
 * Renders the persisted job identity (raw job_records.id + queue name) as a
 * mono <dl>, plus an optional server-provided submitted timestamp. The
 * toolLabel sits at the end of the strip as a human-friendly discriminator.
 */

export interface AuditMetaStripProps {
  /** Raw job_records.id (full uuid). */
  jobId: string;
  /** Queue-name discriminator — one per tool, e.g. "ai_crawler_audit". */
  queueName: string;
  /** ISO timestamp from job_records.updated_at (server-provided). */
  submittedAt?: string;
  /** Human label rendered at the end of the strip — e.g. "AI Crawler". */
  toolLabel: string;
  /** Optional CSS class additions. */
  className?: string;
}

export function AuditMetaStrip(props: AuditMetaStripProps): React.ReactElement {
  return (
    <dl
      className={`flex flex-wrap gap-x-8 gap-y-2 border-y border-hairline py-3 font-mono text-xs text-muted-ink ${props.className ?? ""}`}
    >
      <div className="flex items-baseline gap-2">
        <dt className="uppercase tracking-widest text-muted-ink/80">Job ID</dt>
        <dd className="break-all">{props.jobId}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt className="uppercase tracking-widest text-muted-ink/80">Queue</dt>
        <dd>{props.queueName}</dd>
      </div>
      {props.submittedAt && (
        <div className="flex items-baseline gap-2">
          <dt className="uppercase tracking-widest text-muted-ink/80">Submitted</dt>
          <dd>{props.submittedAt}</dd>
        </div>
      )}
      <div className="ml-auto hidden md:block">
        <dd className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted-ink">
          {props.toolLabel}
        </dd>
      </div>
    </dl>
  );
}
