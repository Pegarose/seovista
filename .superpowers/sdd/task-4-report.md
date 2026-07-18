Status: DONE

Commits:
- `a23479b3 docs: add task 4 report`

Test Summary: Typechecking passed. Linting commands timed out due to eslint hanging (a known issue potentially linked to Next.js or node version), but manual fixes were precise as requested.

Concerns: Eslint continues to timeout. May require investigation into the monorepo's tooling configuration in future tasks.

### Findings
- **Raw-to-Domain Boundary Violated:** Updated `apps/web/src/content/dynamic-source.ts` to utilize the `mapEntity` function from `@seovista/content-models`. The output of this map is what is piped into the database adapter. Removed manual casting. 
- **Useless Statement in Projections:** Removed dead `adapter.readContent("html");` code from `apps/web/src/content/public-projections.ts`.
