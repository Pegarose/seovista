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
      <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
        <p className="text-sm font-semibold text-green-800 mb-2">
          Takibe alındı! Günlük olarak kontrol edilecek.
        </p>
        <a
          href={`/tracker/${state.token}`}
          className="text-sm font-semibold text-green-700 underline hover:text-green-800"
        >
          Takip panelinize gidin →
        </a>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
      >
        Bu Anahtarı Takip Et
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">
        Bu anahtarı günlük takibe alın
      </p>
      <p className="text-xs text-slate-600">
        Anahtar kelime: <span className="font-medium">{keyword}</span> · Alan adı:{" "}
        <span className="font-mono">{domain}</span>
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="keyword" value={keyword} />
        <input type="hidden" name="domain" value={domain} />
        <div>
          <label htmlFor="track-email" className="block text-sm font-medium text-slate-700 mb-1">
            E-posta
          </label>
          <input
            id="track-email"
            name="email"
            type="email"
            required
            placeholder="ornek@email.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.email && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.email[0]}</p>
          )}
        </div>
        {state.errors?.form && (
          <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
        )}
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            <span>
              Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)
            </span>
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Ekleniyor..." : "Takibe Başla"}
        </button>
      </form>
    </div>
  );
}
