# SeoVista GEO Readiness Checker - Front-End Implementation Spec

## Overview
This document outlines the architectural plan for implementing the GEO (Generative Engine Optimization) Readiness Checker front-end flow within the SeoVista Next.js application.

## Flow Architecture

The user journey consists of a multi-step Server Action-driven flow:

1. **Initial Lead Capture (Domain Input):** `apps/web/app/tools/geo-readiness-checker/page.tsx`
2. **Polling / Processing State:** `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx` (Pre-completion)
3. **Email Capture & Consent (Gate):** `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx` (Post-completion, Pre-view)
4. **Final Results View:** `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx` (Post-email capture)

## Detailed Component Specifications

### 1. `apps/web/app/tools/geo-readiness-checker/page.tsx` (Start Page)

**Purpose:** Gathers target domain, brand name, and primary target market to initiate the audit.

**Implementation Details:**
- **UI:** A clean, optimized form utilizing Tailwind v4 utility classes.
- **Form State:** Uses React's `useActionState` (or modern equivalent for React 19) to handle form submission without client-side JavaScript dependency for core logic.
- **Validation (Zod):** 
  ```typescript
  const AuditRequestSchema = z.object({
    domain: z.string().url().or(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/)),
    brandName: z.string().min(2),
    primaryMarket: z.string().min(2)
  });
  ```
- **Server Action (`actions/start-audit.ts`):**
  - Parses and validates form data using Zod.
  - Invokes backend logic (e.g., via `worker` package or database insert) to create the job and partial lead: `geoAuditRepository.createLead(domain, brandName, primaryMarket)`.
  - Determines the newly created `jobId` and `leadId`.
  - **Redirect:** Issues a server-side `redirect(\`/tools/geo-readiness-checker/result/\${jobId}\`)`.

### 2. `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx` (Result / Polling Page)

**Purpose:** Acts as a multi-state container page handling polling, email capture, and final result rendering based on the job's lifecycle.

**State Flow:**

**A. Processing State (Polling via Client Component)**
- Rendered when the job status is `pending` or `processing`.
- Employs a Client Component wrapper (e.g., `<PollingContainer jobId={jobId} />`) that polls a specific Server Action or utilizes React Suspense with streaming updates if the architecture allows for a push model. Since we are strictly using Server Actions without API routes, periodic Server Action invocations inside a `useEffect` are appropriate.
- **UI:** Engaging loading states, generic GEO tips, or progress steps to decrease perceived wait time using Tailwind v4 animations.

**B. Completion Gate (Email Capture Form)**
- Rendered when the job completes, but the associated `leadRecord` lacks an email/consent.
- **UI:** An overlay or dedicated form view asking for email to unlock results.
- **Validation (Zod):**
  ```typescript
  const EmailCaptureSchema = z.object({
    email: z.string().email(),
    consent: z.boolean().refine(val => val === true, { message: "Consent is required" })
  });
  ```
- **Server Action (`actions/capture-email.ts`):**
  - Validates email and consent.
  - Updates the lead record: `geoAuditRepository.updateLeadEmail(leadId, email, consent)`.
  - On success, triggers a revalidation of the current path (`revalidatePath`) to re-render section C.

**C. Final Results View**
- Rendered when the job is complete AND the lead record has an email.
- This is a pure Server Component rendering the specific data points calculated by the backend.
- Displays metrics, actionable insights, and GEO scoring.

## Technical Constraints & Standards

- **Strict Framework Boundaries:** Zero API routes (`app/api/*`). All data mutations must flow through React Server Actions.
- **Styling:** Exclusively Tailwind CSS v4. No external CSS-in-JS libraries or arbitrary global CSS unless mandated by the core design system.
- **Validation:** Zod schemas must act as the single source of truth for both client-side progressively-enhanced form validation and server-side mutation verification.
- **Component Strategy:** Default to Server Components. Push interactivity (polling, form states) to the leaves (Client Components) only when absolutely necessary for UX requirements.
- **Type Safety:** Ensure end-to-end type safety between Server Actions and Client Components.

## Error Handling

- Form errors must be returned clearly from Server Actions to the UI using standardized structures (e.g., returning `{ errors: { field: ['message'] } }`).
- Unexpected failures during job processing should transition the Polling UI to a distinct error state, preventing infinite loops.
