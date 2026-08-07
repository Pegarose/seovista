"use client";

import { useActionState } from "react";
import { startGeoAuditAction, type ActionState } from "../../../src/lib/geo-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
  selectFieldClass,
} from "../../../src/components/form-pages";

const initialState: ActionState = {
  status: "idle",
};

// exactOptionalPropertyTypes: FormField's optional `error` can't receive an
// explicit `undefined`, so spread the field error only when one is present.
function errorProps(errors?: string[]): { error: string } | {} {
  return errors?.length ? { error: errors.join(", ") } : {};
}

export default function GeoReadinessCheckerPage() {
  const [state, formAction, isPending] = useActionState(startGeoAuditAction, initialState);

  return (
    <FormShell
      title="GEO Readiness Checker"
      helper="Find out how well your brand performs across AI Overviews and major Search Engines."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && (
          <FormErrorNote message={state.errors.form.join(", ")} />
        )}

        <FormField id="domain" label="Domain URL" {...errorProps(state.errors?.domain)}>
          <input
            id="domain"
            name="domain"
            type="url"
            required
            placeholder="https://example.com"
            className={fieldClass}
          />
        </FormField>

        <FormField id="brandName" label="Brand Name" {...errorProps(state.errors?.brandName)}>
          <input
            id="brandName"
            name="brandName"
            type="text"
            required
            placeholder="Acme Corp"
            className={fieldClass}
          />
        </FormField>

        <FormField id="primaryMarket" label="Primary Market" {...errorProps(state.errors?.primaryMarket)}>
          <div className="relative">
            <select
              id="primaryMarket"
              name="primaryMarket"
              required
              defaultValue=""
              className={selectFieldClass}
            >
              <option value="" disabled>Select your market</option>
              <option value="USA">United States</option>
              <option value="UK">United Kingdom</option>
              <option value="TR">Turkey</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="GLOBAL">Global</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-ink">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </FormField>

        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="Starting Audit...">
            Start Free Audit
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}

