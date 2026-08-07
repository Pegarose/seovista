"use client";

import { useActionState } from "react";
import { startAiCrawlerAuditAction, type AiCrawlerActionState } from "../../../src/lib/ai-crawler-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
} from "../../../src/components/form-pages";

const initialState: AiCrawlerActionState = {
  status: "idle",
};

// exactOptionalPropertyTypes: FormField's optional `error` can't receive an
// explicit `undefined`, so spread the field error only when one is present.
function errorProps(errors?: string[]): { error: string } | {} {
  return errors?.length ? { error: errors.join(", ") } : {};
}

export default function AiCrawlerCheckerPage() {
  const [state, formAction, isPending] = useActionState(startAiCrawlerAuditAction, initialState);

  return (
    <FormShell
      title="AI Crawler Checker"
      helper="robots.txt dosyanızın GPTBot, ClaudeBot, PerplexityBot gibi AI botlarına ve geleneksel arama botlarına hangi erişimi verdiğini test edin."
    >
      <form action={formAction} className="mt-10 max-w-2xl space-y-8">
        {state.errors?.form && (
          <FormErrorNote message={state.errors.form.join(", ")} />
        )}

        <FormField id="url" label="Site URL Adresi" {...errorProps(state.errors?.url)}>
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
            AI Crawler Denetimini Başlat
          </SubmitButton>
        </div>
      </form>
    </FormShell>
  );
}
