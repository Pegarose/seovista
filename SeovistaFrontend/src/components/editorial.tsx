import type { ReactNode } from "react";

export function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-ink">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
      {children}
    </span>
  );
}

export function EditorialCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-hairline bg-card p-6">
      {eyebrow && (
        <div className="text-xs font-semibold uppercase tracking-widest text-spectral">
          {eyebrow}
        </div>
      )}
      <h3 className="mt-2 font-serif text-xl text-ink">{title}</h3>
      <div className="mt-3 text-sm leading-relaxed text-muted-ink">{children}</div>
    </article>
  );
}

export function MethodologyStep({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-4 border-t border-hairline py-6 first:border-t-0">
      <div className="font-mono text-xs text-muted-ink">{String(index).padStart(2, "0")}</div>
      <div>
        <h3 className="font-serif text-lg text-ink">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-ink">{children}</p>
      </div>
    </li>
  );
}

export function UnavailableState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-ember/40 bg-mineral/40 p-8 text-center"
    >
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ember">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember" aria-hidden="true" />
        Unavailable
      </p>
      <p className="mt-3 font-serif text-lg text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-ink">{description}</p>
    </div>
  );
}

export function LoadingState({
  title = "Loading",
  description,
  lines = 3,
}: {
  title?: string;
  description?: string;
  lines?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-lg border border-hairline bg-card p-8"
    >
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-signal">
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-signal"
          aria-hidden="true"
        />
        {title}
      </p>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-ink">{description}</p>
      )}
      <div className="mt-5 space-y-2" aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-sm border border-hairline bg-mineral/60"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
      <span className="sr-only">Content is loading.</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-hairline bg-paper p-8 text-center"
    >
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-ink">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-muted-ink/60"
          aria-hidden="true"
        />
        Nothing here yet
      </p>
      <p className="mt-3 font-serif text-lg text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-ink">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function SkeletonBar({ width = "100%" }: { width?: string }) {
  return (
    <div
      className="h-3 animate-pulse rounded-sm border border-hairline bg-mineral/60"
      style={{ width }}
    />
  );
}

/**
 * Layout-matching skeleton for the Editorial Ledger on /insights.
 * Announced politely for screen readers via aria-live/aria-busy.
 */
export function LedgerSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the editorial ledger.</span>
      <ul
        className="flex flex-col divide-y divide-hairline border-y border-hairline"
        aria-hidden="true"
      >
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="py-8">
            <div className="grid grid-cols-[3rem_1fr] items-baseline gap-x-6">
              <SkeletonBar width="1.75rem" />
              <div className="space-y-3">
                <SkeletonBar width="6rem" />
                <div className="h-6 animate-pulse rounded-sm border border-hairline bg-mineral/60" style={{ width: `${80 - i * 8}%` }} />
                <SkeletonBar width={`${70 - i * 6}%`} />
                <SkeletonBar width={`${55 - i * 4}%`} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Layout-matching skeleton for the Instrument Index on /tools.
 */
export function InstrumentIndexSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the instrument index.</span>
      <ul
        className="flex flex-col divide-y divide-hairline border-y border-hairline"
        aria-hidden="true"
      >
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="py-8">
            <div className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-x-6 gap-y-3">
              <SkeletonBar width="1.75rem" />
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-48 animate-pulse rounded-sm border border-hairline bg-mineral/60" />
                  <div className="h-4 w-20 animate-pulse rounded-full border border-hairline bg-mineral/60" />
                </div>
                <SkeletonBar width={`${70 - i * 6}%`} />
                <SkeletonBar width={`${55 - i * 4}%`} />
              </div>
              <div className="hidden md:block">
                <SkeletonBar width="5rem" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Error state with an accessible retry action.
 */
export function RetryError({
  title,
  description,
  onRetry,
  retryLabel = "Try again",
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-dashed border-ember/40 bg-mineral/40 p-8 text-center"
    >
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ember">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember" aria-hidden="true" />
        Something went wrong
      </p>
      <p className="mt-3 font-serif text-lg text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-ink">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-hairline bg-paper px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink transition-colors hover:border-signal hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

