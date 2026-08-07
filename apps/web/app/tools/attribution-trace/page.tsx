"use client";

import { useActionState } from "react";
import {
  startAttributionTraceAction,
  type AttributionTraceActionState,
} from "../../../src/lib/attribution-trace/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
} from "../../../src/components/form-pages";

const initialState: AttributionTraceActionState = { status: "idle" };

// exactOptionalPropertyTypes: FormField's optional `error` can't receive an
// explicit `undefined`, so spread the field error only when one is present.
function errorProps(errors?: string[]): { error: string } | {} {
  return errors?.length ? { error: errors.join(", ") } : {};
}

export default function AttributionTracePage() {
  const [state, formAction, isPending] = useActionState(startAttributionTraceAction, initialState);

  return (
    <FormShell
      title="Attribution Trace"
      helper="Yapıştırdığınız AI yanıtındaki her iddiayı, sitenizin kendi içeriği ve anahtar kelimenin SERP sonuçlarıyla karşılaştırır. Hangi iddiayı kendi içeriğinizden, hangisini rakip kaynaklardan, hangisini hiçbir yerden destekleyemediğimizi dürüstçe raporlar."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && <FormErrorNote message={state.errors.form.join(", ")} />}
        <FormField id="domain" label="Sitenizin alan adı" {...errorProps(state.errors?.domain)}>
          <input
            id="domain"
            name="domain"
            type="text"
            required
            placeholder="example.com"
            className={fieldClass}
          />
        </FormField>
        <FormField id="keyword" label="Anahtar kelime" {...errorProps(state.errors?.keyword)}>
          <input
            id="keyword"
            name="keyword"
            type="text"
            placeholder="örn. istanbul seo danışmanlığı"
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-muted-ink">
            (isteğe bağlı) — Boş bırakılırsa dış kaynak araması atlanır; yalnızca sitenizin kendi
            içeriği ile karşılaştırılır.
          </p>
        </FormField>
        <FormField id="answer" label="AI yanıtı" {...errorProps(state.errors?.answer)}>
          <textarea
            id="answer"
            name="answer"
            rows={8}
            required
            minLength={40}
            maxLength={8000}
            placeholder="AI motorunuzun (örn. ChatGPT, Perplexity) size verdiği yanıtı buraya yapıştırın..."
            className={fieldClass}
          />
        </FormField>
        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="İzleniyor...">
            Attribution Trace Başlat
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
