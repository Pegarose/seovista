"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { authenticateAction, type AuthenticateState } from "@/lib/admin/actions";

const initialState: AuthenticateState = {};

export function LoginForm(): React.ReactElement {
  const searchParams = useSearchParams();
  const [state, formAction, isPending] = useActionState(authenticateAction, initialState);

  // Still allow reading error from URL to handle redirects from previously unauthenticated areas
  const urlFailed = searchParams.get("error") === "invalid";
  const errorMessage = state.error || (urlFailed ? "Email or password is invalid." : null);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="returnTo" value={searchParams.get("returnTo") ?? "/admin/"} />
      <div>
        <label htmlFor="admin-email" className="block text-sm font-medium text-slate-700">Email</label>
        <input id="admin-email" name="email" type="email" autoComplete="username" required disabled={isPending} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:opacity-50" />
      </div>
      <div>
        <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700">Password</label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required disabled={isPending} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:opacity-50" />
      </div>
      {errorMessage ? <p role="alert" className="text-sm font-medium text-red-700">{errorMessage}</p> : null}
      <button type="submit" disabled={isPending} className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:opacity-50">
        {isPending ? "Signing in..." : "Continue"}
      </button>
    </form>
  );
}
