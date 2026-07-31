"use client";

import { useActionState } from "react";
import { startSchemaAuditAction, type SchemaActionState } from "../../../src/lib/schema-checker/actions";

const initialState: SchemaActionState = {
  status: "idle",
};

export default function SchemaCheckerPage() {
  const [state, formAction, isPending] = useActionState(startSchemaAuditAction, initialState);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Schema & Yapısal Veri Denetleyicisi
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Web sitenizdeki JSON-LD ve Schema.org yapılarını, arama motorları ve AI botları için test edin.
            </p>
          </div>

          <form action={formAction} className="space-y-6">
            {state.errors?.form && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
                {state.errors.form.join(", ")}
              </div>
            )}

            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700">
                Sayfa URL Adresi
              </label>
              <div className="mt-1">
                <input
                  id="url"
                  name="url"
                  type="url"
                  required
                  placeholder="https://example.com"
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                />
              </div>
              {state.errors?.url && (
                <p className="mt-2 text-sm text-red-600">{state.errors.url.join(", ")}</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending ? "Denetim Başlatılıyor..." : "Schema Denetimini Başlat"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
