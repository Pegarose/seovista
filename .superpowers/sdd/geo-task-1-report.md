# Task 1 Report: Audit Leads and Jobs DB Schema

## Status
DONE

## Commits
- `7086687` feat(worker,db): add geo_audit_leads table and db repository (amended)

## Test Summary
2 tests passed (Geo Audit Repository > can create a lead and update the email later, can create a job record wrapping job_records).

## Files Created/Modified
- `apps/worker/migrations/010_create_geo_audit_leads.sql` (Created)
- `apps/worker/src/db/geo-audit-repository.ts` (Created)
- `apps/worker/src/__tests__/geo-audit-repository.test.ts` (Created)
- `apps/worker/src/db/index.ts` (Modified)

## Output / Execution Details
- Initial vitest failure due to missing file verified.
- Schema migration written with `TIMESTAMPTZ` and `UUID` according to guidelines along with `job_records` relation.
- DB logic implementation maps directly against provided requirements with `returning *`.
- Adjusted repository name to `geo-audit-repository.ts` to avoid conflict with existing `audit-repository.ts` in `src/db`. 
- Modified `index.ts` correctly.
- Test fixed to use `setupTestEnvironment` helper because original script helpers (`getTestDb`, `closeTestDb`, `runMigrations`) were not structured like that. Tests passed successfully.
- **Fix Round 1:** 
  - Added the missing unified function `createJobRecord` to wrap `job_records` insert logic inside `createGeoAuditRepository`.
  - Updated the import to include `.js` (`import type { DbClient } from "./client.js";`) for TS module resolution consistency.
  - Added new integration test to assert that `createJobRecord` correctly populates `job_records` with `lead_id` and auto-generated correlation UUIDs.

## Concerns
- The instructions originally named the file `audit-repository.ts`. An existing `audit.ts` / `audit_logs` table already exports `createAuditRepository`. To prevent collisions, I created `geo-audit-repository.ts` and `createGeoAuditRepository`.
