"use client";

import { useState, useActionState } from "react";
import {
  createTrackerTargetAction,
  type TrackerTargetActionState,
} from "../../lib/tracker/actions";

const initialState: TrackerTargetActionState = { status: "idle" };

export function TrackThisButton({ keyword, domain }: { keyword: string; domain: string }) {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetAction,
    initialState,
  );

  if (state.status === "success" && state.token) {
    return (
      <div className="rounded-lg border border-signal/40 bg-mineral p-4" role="status">
        <p className="text-sm font-semibold text-signal mb-2">
          Tracking added. This keyword will be checked daily.
        </p>
        <a
          href={`/tracker/${state.token}`}
          className="text-sm font-semibold text-signal underline hover:text-signal/80"
        >
          Go to your tracking dashboard →
        </a>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border border-hairline bg-paper px-4 py-2.5 font-semibold text-ink hover:bg-mineral transition-colors"
      >
        Track this keyword
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-paper p-4">
      <p className="text-sm font-semibold text-ink">
        Track this keyword daily
      </p>
      <p className="text-xs text-muted-ink">
        Keyword: <span className="font-medium text-ink">{keyword}</span> · Domain:{" "}
        <span className="font-mono">{domain}</span>
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="keyword" value={keyword} />
        <input type="hidden" name="domain" value={domain} />
        <div>
          <label htmlFor="track-email" className="block text-sm font-medium text-muted-ink mb-1">
            Email
          </label>
          <input
            id="track-email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-lg border border-hairline px-3 py-2 text-ink focus:border-spectral focus:outline-none"
          />
          {state.errors?.email && (
            <p className="mt-1 text-sm text-ember" role="alert">{state.errors.email[0]}</p>
          )}
        </div>
        {state.errors?.form && (
          <p className="text-sm text-ember" role="alert">{state.errors.form[0]}</p>
        )}
        <div>
          <label className="flex items-start gap-2 text-sm text-muted-ink">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 rounded border-hairline text-spectral focus:ring-spectral"
            />
            <span>
              Email me when this keyword changes position. (Optional)
            </span>
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-ink px-4 py-2 font-semibold text-paper hover:bg-mineral disabled:opacity-50 transition-colors"
        >
          {isPending ? "Adding..." : "Start tracking"}
        </button>
      </form>
    </div>
  );
}
