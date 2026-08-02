"use client";

import { useActionState } from "react";
import { createTrackerTargetAction, type TrackerTargetActionState } from "../../lib/tracker/actions";

const initialState: TrackerTargetActionState = { status: "idle" };

export function TrackerForm() {
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="tracker-email" className="block text-sm font-medium text-slate-700 mb-1">
            E-posta
          </label>
          <input
            id="tracker-email"
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

        <div>
          <label htmlFor="tracker-keyword" className="block text-sm font-medium text-slate-700 mb-1">
            Anahtar Kelime
          </label>
          <input
            id="tracker-keyword"
            name="keyword"
            type="text"
            required
            placeholder="seo denetimi"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.keyword && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.keyword[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="tracker-domain" className="block text-sm font-medium text-slate-700 mb-1">
            Alan Adı
          </label>
          <input
            id="tracker-domain"
            name="domain"
            type="text"
            required
            placeholder="ornek.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.domain && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.domain[0]}</p>
          )}
        </div>

        {state.errors?.form && (
          <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Ekleniyor..." : "Takibe Başla"}
        </button>
      </form>

      {state.status === "success" && state.token && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
          <p className="text-sm font-semibold text-green-800 mb-2">
            Takip hedefiniz eklendi! Günlük olarak kontrol edilecek.
          </p>
          <p className="text-sm text-green-700 mb-2">
            Takip panelinizi görüntülemek için aşağıdaki bağlantıyı yer imine ekleyin:
          </p>
          <a
            href={`/tracker/${state.token}`}
            className="block w-full rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-sm text-green-900 break-all hover:bg-green-50 transition-colors"
          >
            {typeof window !== "undefined" ? `${window.location.origin}/tracker/${state.token}` : `/tracker/${state.token}`}
          </a>
        </div>
      )}
    </div>
  );
}
