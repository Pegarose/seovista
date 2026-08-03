### Task 6: Web — validation + consent server actions

**Files:**
- Modify: `apps/web/src/lib/tracker/validation.ts`
- Modify: `apps/web/src/lib/tracker/actions.ts`
- Test: `apps/web/src/lib/tracker/__tests__/actions.test.ts` (extend)

**Interfaces:**
- Consumes: `createTrackerRepository` from `@seovista/worker` (Task 2 methods).
- Produces:
  - `validateTrackerTargetInput` returns `{ consent: boolean }` in `data`.
  - `createTrackerTargetAction` reads `consent` from FormData and passes it to `findOrCreateSession(email, consent)`.
  - `updateAlertConsentAction(token: string, consent: boolean): Promise<{ success: boolean; error?: string }>`.

- [ ] **Step 1: Write the failing web tests**

Append to `apps/web/src/lib/tracker/__tests__/actions.test.ts`:

```ts
// --- B3: consent ---

describe("validateTrackerTargetInput consent", () => {
  it("preprocesses consent from 'on' to true", () => {
    const fd = new FormData();
    fd.set("email", "user@example.com");
    fd.set("keyword", "seo");
    fd.set("domain", "example.com");
    fd.set("consent", "on");
    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo", domain: "example.com", consent: fd.get("consent")?.toString() ?? "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.consent).toBe(true);
  });

  it("preprocesses missing consent to false", () => {
    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo", domain: "example.com", consent: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.consent).toBe(false);
  });
});

describe("createTrackerTargetAction consent", () => {
  beforeEach(() => {
    mockGetAdminDb.mockReturnValue({ query: vi.fn() });
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    mockFindOrCreateSession.mockResolvedValue({ id: SESSION_ID, token: SESSION_REF });
    mockCountActiveTargets.mockResolvedValue(0);
    mockCreateTarget.mockResolvedValue({ id: TARGET_ID });
  });

  it("passes consent=true to findOrCreateSession for a new session", async () => {
    setupRepoMock();
    const fd = buildFormData({ email: "user@example.com", keyword: "seo", domain: "example.com" });
    fd.set("consent", "on");
    await createTrackerTargetAction({ status: "idle" }, fd);
    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com", true);
  });

  it("passes consent=false when the checkbox is absent", async () => {
    setupRepoMock();
    const fd = buildFormData({ email: "user@example.com", keyword: "seo", domain: "example.com" });
    await createTrackerTargetAction({ status: "idle" }, fd);
    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com", false);
  });
});

describe("updateAlertConsentAction", () => {
  it("rejects a malformed token", async () => {
    const { updateAlertConsentAction } = await import("../actions");
    const result = await updateAlertConsentAction("not-a-uuid", true);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown token", async () => {
    mockFindSessionByToken.mockResolvedValue(null);
    const { updateAlertConsentAction } = await import("../actions");
    const result = await updateAlertConsentAction(SESSION_REF, true);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Takip paneli bulunamadı.");
  });

  it("updates consent for a valid token", async () => {
    mockFindSessionByToken.mockResolvedValue({ id: SESSION_ID, email: "user@example.com" });
    const mockUpdateAlertConsent = vi.fn().mockResolvedValue(undefined);
    mockCreateTrackerRepository.mockReturnValue({
      findSessionByToken: mockFindSessionByToken,
      updateAlertConsent: mockUpdateAlertConsent,
    });
    const { updateAlertConsentAction } = await import("../actions");
    const result = await updateAlertConsentAction(SESSION_REF, true);
    expect(result.success).toBe(true);
    expect(mockUpdateAlertConsent).toHaveBeenCalledWith(SESSION_ID, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- tracker-actions`

Expected: FAIL — `validateTrackerTargetInput` has no `consent` field, `createTrackerTargetAction` doesn't pass consent, and `updateAlertConsentAction` is undefined.

- [ ] **Step 3: Implement validation changes**

In `apps/web/src/lib/tracker/validation.ts`, replace the `TrackerTargetFormSchema` and `validateTrackerTargetInput`:

```ts
const consentPreprocess = z.preprocess((v) => ({ on: true, "": false, false: false, true: true })[String(v)] ?? false, z.boolean());

export const TrackerTargetFormSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta giriniz."),
  keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
  domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
  consent: consentPreprocess,
});

export function validateTrackerTargetInput(input: { email: string; keyword: string; domain: string; consent?: string }) {
  return TrackerTargetFormSchema.safeParse({
    email: input.email,
    keyword: input.keyword,
    domain: input.domain,
    consent: input.consent ?? "",
  });
}
```

Note: `TrackerSessionTargetSchema` (the dashboard inline form, no email) is intentionally unchanged — it collects no consent.

- [ ] **Step 4: Implement action changes**

In `apps/web/src/lib/tracker/actions.ts`:

1. In `createTrackerTargetAction`, read consent from FormData and pass it to `findOrCreateSession`. Replace the call `const session = await repo.findOrCreateSession(email);` with:

```ts
    const consent = formData.get("consent")?.toString() ?? "";
    const session = await repo.findOrCreateSession(email, consent === "on");
```

2. Add `updateAlertConsentAction` at the end of the file (after `createTrackerTargetForSessionAction`):

```ts
export async function updateAlertConsentAction(
  token: string,
  consent: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!TOKEN_RE.test(token)) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    await repo.updateAlertConsent(session.id, consent);
    revalidatePath(`/tracker/${token}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to update alert consent:", error);
    return { success: false, error: "E-posta uyarı tercihi güncellenemedi." };
  }
}
```

- [ ] **Step 5: Run the web tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- tracker-actions`

Expected: PASS.

- [ ] **Step 6: Typecheck and lint the web app**

Run: `pnpm --filter @seovista/web typecheck` and `pnpm --filter @seovista/web lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/tracker/validation.ts apps/web/src/lib/tracker/actions.ts apps/web/src/lib/tracker/__tests__/actions.test.ts
git commit -m "feat(web): add tracker alert consent validation and actions"
```
