"use client";

import { useActionState } from "react";
import { SERP_LOCALES } from "@seovista/seo-core";
import {
  startKeywordRankCheckAction,
  type KeywordRankActionState,
} from "../../../src/lib/keyword-rank-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
  selectFieldClass,
} from "../../../src/components/form-pages";

const initialState: KeywordRankActionState = { status: "idle" };

// exactOptionalPropertyTypes: FormField's optional `error` can't receive an
// explicit `undefined`, so spread the field error only when one is present.
function errorProps(errors?: string[]): { error: string } | {} {
  return errors?.length ? { error: errors.join(", ") } : {};
}

export default function KeywordRankCheckerPage() {
  const [state, formAction, isPending] = useActionState(startKeywordRankCheckAction, initialState);

  return (
    <FormShell
      title="Anahtar Kelime Sıralama Kontrolü"
      helper="SearXNG üzerinden ilk 10 sonuçta alan adınızın konumunu kontrol edin. Sonuç, kontrol anına ait dürüst bir anlık görüntüdür."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && <FormErrorNote message={state.errors.form.join(", ")} />}
        <FormField id="domain" label="Alan Adı" {...errorProps(state.errors?.domain)}>
          <input
            id="domain"
            name="domain"
            type="text"
            required
            placeholder="example.com"
            className={fieldClass}
          />
        </FormField>
        <FormField id="keyword" label="Anahtar Kelime" {...errorProps(state.errors?.keyword)}>
          <input
            id="keyword"
            name="keyword"
            type="text"
            required
            placeholder="örn. seo denetimi"
            className={fieldClass}
          />
        </FormField>
        <FormField id="locale" label="Arama Bölgesi" {...errorProps(state.errors?.locale)}>
          <div className="relative">
            <select
              id="locale"
              name="locale"
              required
              defaultValue="tr-TR"
              className={selectFieldClass}
            >
              {Object.entries(SERP_LOCALES).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-ink">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </FormField>
        <div className="pt-2">
          <SubmitButton pending={isPending} pendingLabel="Kontrol Ediliyor...">
            Sıralamayı Kontrol Et
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
