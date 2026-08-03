### Task 7: Web — consent checkbox on both tracker forms

**Files:**
- Modify: `apps/web/src/components/tracker/tracker-form.tsx`
- Modify: `apps/web/src/components/tracker/track-this-button.tsx`
- Test: `apps/web/src/__tests__/tracker-track-this-button.test.ts` (extend), plus `tracker-form` coverage if needed

**Interfaces:**
- Consumes: `createTrackerTargetAction` (Task 6) — reads `consent` from FormData.
- Produces: no new interfaces; both forms submit a `consent` field.

- [ ] **Step 1: Write the failing component tests**

Extend `apps/web/src/__tests__/tracker-track-this-button.test.ts` (and add coverage for the checkbox in `tracker-form` if not already present). Append a test that asserts the markup contains `name="consent"` and the label text "Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum.".

Because `TrackThisButton` renders its form only when expanded, and the existing test renders the collapsed state, you may instead test the always-visible `TrackerForm` component in this file or in a new `apps/web/src/__tests__/tracker-form.test.ts` — as long as the checkbox is covered by a passing test.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- tracker-track-this-button`

Expected: FAIL — no `name="consent"` checkbox in the markup.

- [ ] **Step 3: Add the checkbox to `tracker-form.tsx`**

Insert before the submit button in `apps/web/src/components/tracker/tracker-form.tsx`:

```tsx
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            <span>
              Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)
            </span>
          </label>
        </div>
```

- [ ] **Step 4: Add the checkbox to `track-this-button.tsx`**

Insert before the submit button in the inline form (inside `apps/web/src/components/tracker/track-this-button.tsx`):

```tsx
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            <span>
              Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)
            </span>
          </label>
        </div>
```

- [ ] **Step 5: Run the component tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- tracker-track-this-button`

If you added a `tracker-form` test, also run: `pnpm --filter @seovista/web test -- tracker-form`

Expected: PASS.

- [ ] **Step 6: Typecheck and lint the web app**

Run: `pnpm --filter @seovista/web typecheck` and `pnpm --filter @seovista/web lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/tracker/tracker-form.tsx apps/web/src/components/tracker/track-this-button.tsx apps/web/src/__tests__/tracker-track-this-button.test.ts
git commit -m "feat(web): add alert consent checkbox to tracker forms"
```

If you created a new `tracker-form.test.ts`, include it in the commit.
