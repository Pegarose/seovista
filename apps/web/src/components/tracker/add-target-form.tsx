"use client";

import { useActionState } from "react";
import {
  createTrackerTargetForSessionAction,
  type TrackerSessionTargetActionState,
} from "../../lib/tracker/actions";

const initialState: TrackerSessionTargetActionState = { status: "idle" };

export function AddTargetForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetForSessionAction.bind(null, token),
    initialState,
  );

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Yeni Hedef Ekle</h2>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="add-keyword" className="block text-sm font-medium text-slate-700 mb-1">
            Anahtar Kelime
          </label>
          <input
            id="add-keyword"
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
          <label htmlFor="add-domain" className="block text-sm font-medium text-slate-700 mb-1">
            Alan Adı
          </label>
          <input
            id="add-domain"
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
          {isPending ? "Ekleniyor..." : "Hedef Ekle"}
        </button>
      </form>

      {state.status === "success" && (
        <p className="text-sm text-green-700" role="status">
          Yeni hedef eklendi. Takip paneliniz güncelleniyor.
        </p>
      )}
    </div>
  );
}
