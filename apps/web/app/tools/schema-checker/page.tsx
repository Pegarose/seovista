"use client";

import { useActionState } from "react";
import { startSchemaAuditAction, type SchemaActionState } from "../../../src/lib/schema-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
  fieldErrorProps,
} from "../../../src/components/form-pages";

const initialState: SchemaActionState = {
  status: "idle",
};

export default function SchemaCheckerPage() {
  const [state, formAction, isPending] = useActionState(startSchemaAuditAction, initialState);

  return (
    <FormShell
      title="Schema & Yapısal Veri Denetleyicisi"
      helper="Web sitenizdeki JSON-LD ve Schema.org yapılarını, arama motorları ve AI botları için test edin."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && (
          <FormErrorNote message={state.errors.form.join(", ")} />
        )}

        <FormField id="url" label="Sayfa URL Adresi" {...fieldErrorProps(state.errors?.url)}>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com"
            className={fieldClass}
          />
        </FormField>

        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="Denetim Başlatılıyor...">
            Schema Denetimini Başlat
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
