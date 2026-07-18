# Task 4 Status Report

- **Status**: DONE
- **Commits**: `52bfb92` (feat(web): switch public representations to strictly-isolated dynamic source)
- **Test Summary**: `tsc --noEmit` on `apps/web` passed with 0 errors.

## Findings
- Created `apps/web/src/content/dynamic-source.ts` and configured `createDynamicAdapter` to query `cms_entries` via `getAdminDb()` dynamically avoiding drafts/private leaking into the `public` scope.
- In `public-projections.ts`, connected `getLivePublicMatrix` to generate the read adapter strictly using the `public` configuration payload (`{ kind: "public", now: ... }`).
- Mapped query fields into the required `DomainEntity` structure ensuring compatibility with `Adapter` instances locally.
