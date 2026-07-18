# Final Fix Report

## Overview
This report summarizes the changes made to apply the fixes identified in the final code review. The aim was to close a critical security gap in the preview exchange and prevent a payload merging issue across content mappings.

## Fixes Implemented

### 1. `apps/web/app/api/preview/exchange/route.ts` - Missing RBAC in Preview Exchange
*   **Issue:** The endpoint handled token verification and preview grant resolution but failed to check for an authenticated user possessing the correct administrative capability `CmsCapabilities.Preview`.  This bypassed the mandated server-side authorization primitives.
*   **Resolution:** Modified the route handler to first authenticate the user session via `await requireAdminUser()`, which enforces existence of a current authorized session. Following validation, the capability was confirmed with `await requireCmsCapability(user, CmsCapabilities.Preview)`. This forces the required authorization checks BEFORE the preview token is accepted. 

### 2. `apps/web/src/content/dynamic-source.ts` - Spread Overwrite Risk
*   **Issue:** In `createDynamicAdapter`, the JSON payload mapper destructured trusted system properties prior to applying the untrusted `...row.content` spread. If `row.content` contained conflicting keys (e.g. `id`), it would overwrite system declarations and introduce arbitrary mapping anomalies. 
*   **Resolution:** The logic has been redesigned to apply `...row.content` at the start of the object definition. Trusted administrative parameters (`id`, `collection`, `slug`, `locale`, etc.), as well as the constructed `provenance` block, now follow the spread. By evaluating last, they definitively override any equivalent variables derived from the query, securing the content model.

## Validation
*   No additional changes were needed for the test payloads (`mockEntities` in `tests/domain/public-projections.test.ts`) because the payload modification was internal to the entity mapper `rawEnvelope` assignment where test data simulates properly typed output regardless.
*   `pnpm --filter @seovista/web run typecheck` completed successfully with `[Process exited with code 0]`.
*   Changes have been committed as requested.
