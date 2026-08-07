"use client";

import { useActionState } from "react";
import { startAiCrawlerAuditAction, type AiCrawlerActionState } from "../../../src/lib/ai-crawler-checker/actions";
import {
  FormShell,
  FormField,
  FormErrorNote,
  SubmitButton,
  fieldClass,
  fieldErrorProps,
} from "../../../src/components/form-pages";

const initialState: AiCrawlerActionState = {
  status: "idle",
};

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

        <FormField id="url" label="Site URL Adresi" {...fieldErrorProps(state.errors?.url)}>
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
