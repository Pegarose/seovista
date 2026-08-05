"use client";

import { useActionState } from "react";
import {
  startAttributionTraceAction,
  type AttributionTraceActionState,
} from "../../../src/lib/attribution-trace/actions";

const initialState: AttributionTraceActionState = { status: "idle" };

export default function AttributionTracePage() {
  const [state, formAction, isPending] = useActionState(startAttributionTraceAction, initialState);

  return (
    <main id="main" className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Attribution Trace
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Yapıştırdığınız AI yanıtındaki her iddiayı, sitenizin kendi içeriği ve anahtar kelimenin
              SERP sonuçlarıyla karşılaştırır. Hangi iddiayı kendi içeriğinizden, hangisini rakip
              kaynaklardan, hangisini hiçbir yerden destekleyemediğimizi dürüstçe raporlar.
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
                Sitenizin alan adı
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
                Anahtar kelime <span className="text-gray-400">(isteğe bağlı)</span>
              </label>
              <div className="mt-1">
                <input
                  id="keyword"
                  name="keyword"
                  type="text"
                  placeholder="örn. istanbul seo danışmanlığı"
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                />
              </div>
              {state.errors?.keyword && (
                <p className="mt-2 text-sm text-red-600">{state.errors.keyword.join(", ")}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Boş bırakılırsa dış kaynak araması atlanır; yalnızca sitenizin kendi içeriği ile
                karşılaştırılır.
              </p>
            </div>

            <div>
              <label htmlFor="answer" className="block text-sm font-medium text-gray-700">
                AI yanıtı
              </label>
              <div className="mt-1">
                <textarea
                  id="answer"
                  name="answer"
                  rows={8}
                  required
                  minLength={40}
                  maxLength={8000}
                  placeholder="AI motorunuzun (örn. ChatGPT, Perplexity) size verdiği yanıtı buraya yapıştırın..."
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                />
              </div>
              {state.errors?.answer && (
                <p className="mt-2 text-sm text-red-600">{state.errors.answer.join(", ")}</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending ? "İzleniyor..." : "Attribution Trace Başlat"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
