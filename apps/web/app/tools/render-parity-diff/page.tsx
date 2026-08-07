"use client";

import { useActionState } from "react";
import {
  startRenderParityCheckAction,
  type RenderParityActionState,
} from "../../../src/lib/render-parity-diff/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
} from "../../../src/components/form-pages";

const initialState: RenderParityActionState = { status: "idle" };

// exactOptionalPropertyTypes: FormField's optional `error` can't receive an
// explicit `undefined`, so spread the field error only when one is present.
function errorProps(errors?: string[]): { error: string } | {} {
  return errors?.length ? { error: errors.join(", ") } : {};
}

export default function RenderParityDiffPage() {
  const [state, formAction, isPending] = useActionState(startRenderParityCheckAction, initialState);

  return (
    <FormShell
      title="Render Parity Karşılaştırması"
      helper="Sayfanızı iki kez getirir — bir kez bir tarayıcı User-Agent'ı, bir kez bir bot User-Agent'ı ile — ve iki gösterim arasındaki farkları raporlar. Tarayıcıların gördüğü içerik insanların gördüğü sürümden saparsa bunu işaret eder."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && <FormErrorNote message={state.errors.form.join(", ")} />}
        <FormField id="url" label="Sayfa URL'si" {...errorProps(state.errors?.url)}>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com/page"
            className={fieldClass}
          />
        </FormField>
        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="Karşılaştırılıyor...">
            Karşılaştırmayı Başlat
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
