"use client";

import { useActionState } from "react";
import { startGeoAuditAction, type ActionState } from "../../../src/lib/geo-checker/actions";

const initialState: ActionState = {
  status: "idle",
};

export default function GeoReadinessCheckerPage() {
  const [state, formAction, isPending] = useActionState(startGeoAuditAction, initialState);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              GEO Readiness Checker
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Find out how well your brand performs across AI Overviews and major Search Engines.
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
                Domain URL
              </label>
              <div className="mt-1">
                <input
                  id="domain"
                  name="domain"
                  type="url"
                  required
                  placeholder="https://example.com"
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                />
              </div>
              {state.errors?.domain && (
                <p className="mt-2 text-sm text-red-600">{state.errors.domain.join(", ")}</p>
              )}
            </div>

            <div>
              <label htmlFor="brandName" className="block text-sm font-medium text-gray-700">
                Brand Name
              </label>
              <div className="mt-1">
                <input
                  id="brandName"
                  name="brandName"
                  type="text"
                  required
                  placeholder="Acme Corp"
                  className="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                />
              </div>
              {state.errors?.brandName && (
                <p className="mt-2 text-sm text-red-600">{state.errors.brandName.join(", ")}</p>
              )}
            </div>

            <div>
              <label htmlFor="primaryMarket" className="block text-sm font-medium text-gray-700">
                Primary Market
              </label>
              <div className="mt-1 relative">
                <select
                  id="primaryMarket"
                  name="primaryMarket"
                  required
                  defaultValue=""
                  className="appearance-none block w-full px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-700 transition-colors"
                >
                  <option value="" disabled>Select your market</option>
                  <option value="USA">United States</option>
                  <option value="UK">United Kingdom</option>
                  <option value="TR">Turkey</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="GLOBAL">Global</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
              {state.errors?.primaryMarket && (
                <p className="mt-2 text-sm text-red-600">{state.errors.primaryMarket.join(", ")}</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending ? "Starting Audit..." : "Start Free Audit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
