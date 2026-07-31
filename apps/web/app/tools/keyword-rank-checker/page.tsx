"use client";

import { useActionState } from "react";
import { SERP_LOCALES } from "@seovista/seo-core";
import {
  startKeywordRankCheckAction,
  type KeywordRankActionState,
} from "../../../src/lib/keyword-rank-checker/actions";

const initialState: KeywordRankActionState = {
  status: "idle",
};

export default function KeywordRankCheckerPage() {
  const [state, formAction, isPending] = useActionState(startKeywordRankCheckAction, initialState);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Anahtar Kelime Sıralama Kontrolü
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              SearXNG üzerinden ilk 10 sonuçta alan adınızın konumunu kontrol edin. Sonuç, kontrol
              anına ait dürüst bir anlık görüntüdür.
            </p>
          </div>

          <form action={formAction} className="space-y-6">
            {state.errors?.form && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
                {state.errors.form.join(", ")}
              </div>
            )}

            <div>
              <label htmlFor="domain" className="block text-sm font-medium text-gray-700">
                Alan Adı
              </label>
              <div className="mt-1">
                <input
                  id="domain"
                  name="domain"
                  type="text"
                  required
                  placeholder="example.com"
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                />
              </div>
              {state.errors?.domain && (
                <p className="mt-2 text-sm text-red-600">{state.errors.domain.join(", ")}</p>
              )}
            </div>

            <div>
              <label htmlFor="keyword" className="block text-sm font-medium text-gray-700">
                Anahtar Kelime
              </label>
              <div className="mt-1">
                <input
                  id="keyword"
                  name="keyword"
                  type="text"
                  required
                  placeholder="örn. seo denetimi"
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                />
              </div>
              {state.errors?.keyword && (
                <p className="mt-2 text-sm text-red-600">{state.errors.keyword.join(", ")}</p>
              )}
            </div>

            <div>
              <label htmlFor="locale" className="block text-sm font-medium text-gray-700">
                Arama Bölgesi
              </label>
              <div className="mt-1">
                <select
                  id="locale"
                  name="locale"
                  required
                  defaultValue="tr-TR"
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                >
                  {Object.entries(SERP_LOCALES).map(([value, config]) => (
                    <option key={value} value={value}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              {state.errors?.locale && (
                <p className="mt-2 text-sm text-red-600">{state.errors.locale.join(", ")}</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending ? "Kontrol Ediliyor..." : "Sıralamayı Kontrol Et"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
