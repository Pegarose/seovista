"use client";

import { useActionState } from "react";
import {
  startSchemaTruthCheckAction,
  type SchemaTruthActionState,
} from "../../../src/lib/schema-truth-check/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
  fieldErrorProps,
} from "../../../src/components/form-pages";

const initialState: SchemaTruthActionState = { status: "idle" };

export default function SchemaTruthCheckPage() {
  const [state, formAction, isPending] = useActionState(startSchemaTruthCheckAction, initialState);

  return (
    <FormShell
      title="Schema Doğruluk Denetimi"
      helper={'Yapılandırılmış veri (JSON-LD) içindeki her iddianın sayfanın görünür içeriğinde karşılığını kontrol eder. "Şemada söylediğin şeyleri okuyucu sayfada bulabiliyor mu?" — cevabını dürüstçe verir.'}
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && <FormErrorNote message={state.errors.form.join(", ")} />}
        <FormField id="url" label="Sayfa URL'si" {...fieldErrorProps(state.errors?.url)}>
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
          <SubmitButton pending={isPending} pendingLabel="Denetleniyor...">
            Denetimi Başlat
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
