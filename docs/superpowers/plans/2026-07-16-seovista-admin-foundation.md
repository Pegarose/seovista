# SeoVista Admin Foundation + Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected SeoVista `/admin` foundation with a custom PostgreSQL-backed session, SeoVista RBAC authorization, and a NextG-inspired server-rendered Overview dashboard without importing NextG/Payload infrastructure.

**Architecture:** Keep `apps/web` as the App Router entry point and add a server-only admin boundary that owns session cookies, authentication, authorization, and dashboard aggregation. Reuse the existing worker PostgreSQL client/repositories through a new server-safe worker export path, while keeping `pg`, Redis, BullMQ, passwords, and session tokens out of browser bundles. Add focused public-interface tests first, then implement one vertical slice at a time: session, login/protection, RBAC, and Overview UI.

**Tech Stack:** Next.js 15 App Router, React 19 Server Components, TypeScript strict mode, PostgreSQL 16 via `pg`, existing `@seovista/worker` repositories, Vitest, Playwright, Tailwind CSS v4, `@seovista/ui`.

## Global Constraints

- Node `>=24.0.0 <25.0.0`; pnpm `10.30.1`; use pnpm only.
- Server Components by default. Client Components only for genuine browser interaction.
- `apps/web` must not declare or import `pg`, `ioredis`, `bullmq`, or provider SDKs in browser-facing code.
- `DATABASE_URL`, password hashes, raw session tokens, and session records are server-only and never serialized into HTML or client props.
- Public canonical URLs continue to derive only from trusted `NEXT_PUBLIC_SITE_URL`; admin routes are private and use `robots: { index: false, follow: false }`.
- `/admin` must not be present in public navigation, sitemap, feed, JSON-LD, or public content projections.
- Every admin page has exactly one descriptive `<h1>` inside one `<main>` landmark.
- Do not copy Payload, NextG collection models, commerce modules, tenant switching, or credentials from `C:\bc-proje\nextg`.
- Do not modify the root PRD/implementation brief Markdown documents.
- Preserve existing uncommitted work and generated artifacts. Do not commit or push.

---

## File Map

### Create

- `apps/worker/migrations/007_create_admin_identity_and_sessions.sql`: users, organizations, memberships, and hashed session persistence with expiry/revocation indexes.
- `apps/worker/src/db/admin-auth.ts`: user/session repository contracts and PostgreSQL implementation.
- `apps/worker/src/db/admin-overview.ts`: read-only Overview aggregate query contract and implementation.
- `apps/worker/src/db/admin-seed.ts`: deterministic first operator provisioning helper for local/test setup only.
- `apps/web/src/lib/admin/db.ts`: server-only lazy database client factory and close-safe test injection seam.
- `apps/web/src/lib/admin/session.ts`: server-only token hashing, cookie/session lifecycle, current-user lookup, logout, and auth errors.
- `apps/web/src/lib/admin/authorization.ts`: permission constants and RBAC evaluator against SeoVista’s existing role/permission tables.
- `apps/web/src/lib/admin/overview.ts`: server-only dashboard loader that combines health, jobs, audits, costs, and user context.
- `apps/web/src/lib/admin/metadata.ts`: private admin metadata helper.
- `apps/web/src/components/admin/admin-shell.tsx`: NextG-inspired private shell, sidebar, top context, and sign-out form.
- `apps/web/src/components/admin/admin-stat-card.tsx`: small Overview metric card primitive.
- `apps/web/src/components/admin/admin-status-list.tsx`: recent job/audit status presentation.
- `apps/web/app/admin/login/page.tsx`: server-rendered login form.
- `apps/web/app/admin/login/actions.ts`: login server action and safe failure redirect.
- `apps/web/app/admin/logout/route.ts`: POST-only logout route.
- `apps/web/app/admin/(protected)/layout.tsx`: protected admin layout and authorization boundary.
- `apps/web/app/admin/(protected)/page.tsx`: Overview screen.
- `apps/web/app/admin/(protected)/loading.tsx`: private loading state.
- `apps/web/app/admin/(protected)/error.tsx`: private error state without secret details.
- `apps/web/tests/admin-auth.test.ts`: unit/integration contract tests for cookies, session lifecycle, and auth decisions.
- `apps/web/tests/admin-overview.test.ts`: overview aggregation contract tests with public repository interfaces.
- `apps/web/tests/e2e/admin-auth.spec.ts`: login, unauthorized access, and logout browser behavior.
- `apps/web/tests/e2e/admin-overview.spec.ts`: protected Overview shell and private metadata behavior.

### Modify

- `apps/worker/src/db/index.ts`: export admin auth and overview repository factories/types.
- `apps/web/package.json`: add a server-only workspace dependency on `@seovista/worker` only if the existing boundary checker permits it, otherwise consume a dedicated server adapter package export without adding browser dependencies.
- `apps/web/middleware.ts`: preserve public canonical redirects and explicitly bypass `/admin`, `/admin/login`, and `/api/admin` so private route auth owns those paths.
- `apps/web/app/layout.tsx`: keep the public header/footer only for public routes; do not make the private shell inherit public navigation.
- `apps/web/app/robots.txt/route.ts`: retain `/admin/` disallow rule and add a focused test if response coverage is missing.
- `scripts/verify-package-boundaries.js`: recognize the server-only admin adapter boundary without allowing `pg` or Redis in browser-facing packages.
- `apps/worker/src/__tests__/infrastructure.test.ts`: extend migration expectations from `[1, 2, 3, 4, 5, 6]` to `[1, 2, 3, 4, 5, 6, 7]` and add real PostgreSQL auth/RBAC behavior coverage if this suite remains the canonical integration surface.
- `apps/web/tests/e2e/routes.spec.ts`: keep `/dashboard/` forbidden and add `/admin` private-route expectations in a dedicated admin spec rather than public navigation assertions.

### Reference only, never copy directly

- `C:\bc-proje\nextg\packages\cms-core\src\components\admin\admin-shell.tsx`
- `C:\bc-proje\nextg\packages\cms-core\src\components\admin\admin-ui.tsx`
- `C:\bc-proje\nextg\packages\cms-core\src\lib\admin\auth.ts`
- `C:\bc-proje\nextg\packages\cms-core\src\lib\superadmin\auth.ts`
- `C:\bc-proje\nextg\e2e\admin-login.spec.ts`
- `C:\bc-proje\nextg\e2e\admin-navigation.spec.ts`

---

## Task 1: PostgreSQL Identity, Membership, and Session Persistence

**Files:**
- Create: `apps/worker/migrations/007_create_admin_identity_and_sessions.sql`
- Create: `apps/worker/src/db/admin-auth.ts`
- Modify: `apps/worker/src/db/index.ts`
- Test: `apps/worker/src/__tests__/infrastructure.test.ts` or a focused `apps/worker/src/__tests__/admin-auth.test.ts`

**Interfaces:**
- `createAdminAuthRepository(client: DbClient)` produces:
  - `createUser(input: CreateAdminUser): Promise<AdminUser>`
  - `findUserByEmail(email: string): Promise<AdminUser | null>`
  - `findUserById(id: string): Promise<AdminUser | null>`
  - `createSession(input: CreateAdminSession): Promise<AdminSession>`
  - `findActiveSessionByHash(tokenHash: string, now: Date): Promise<AdminSession | null>`
  - `revokeSessionByHash(tokenHash: string, revokedAt: Date): Promise<void>`
  - `revokeAllUserSessions(userId: string, revokedAt: Date): Promise<void>`
- Password hashes are stored as opaque strings, never returned to web components, and never compared in SQL.
- Organization is optional in the first slice. The first operator is a global SeoVista user with no tenant switching; membership tables are future-safe but not used to invent multi-tenancy.

- [ ] **Step 1: Write the failing migration/repository behavior test**

Test observable behavior through the repository:

```ts
it("persists an admin user and only resolves an unexpired, unrevoked session", async () => {
  const auth = createAdminAuthRepository(env.db);
  const user = await auth.createUser({
    email: `operator-${env.projectId}@seovista.test`,
    displayName: "SeoVista Operator",
    passwordHash: "opaque-password-hash",
    status: "active",
  });
  const session = await auth.createSession({
    userId: user.id,
    tokenHash: "hash-1",
    expiresAt: new Date(Date.now() + 60_000),
  });

  expect((await auth.findActiveSessionByHash("hash-1", new Date()))?.user_id).toBe(user.id);
  await auth.revokeSessionByHash("hash-1", new Date());
  expect(await auth.findActiveSessionByHash("hash-1", new Date())).toBeNull();
});
```

- [ ] **Step 2: Run the focused worker test and verify it fails**

Run: `pnpm --filter @seovista/worker test -- admin-auth`

Expected: FAIL because migration 007 and repository exports do not exist.

- [ ] **Step 3: Add migration 007**

Create UUID-backed `admin_users`, `admin_organizations`, `admin_organization_memberships`, and `admin_sessions` tables. Enforce:

- normalized lowercase unique email;
- non-empty display name and password hash;
- user status `active|disabled`;
- organization membership role `owner|member`;
- session token hash unique, expiry required, optional `revoked_at`, and `created_at`;
- indexes on normalized email, session token hash, user ID, expiry, and revoked state;
- no raw token, plaintext password, or credential field.

- [ ] **Step 4: Implement the minimal repository**

Map SQL rows to strict TypeScript records. Normalize email at the repository boundary. `findActiveSessionByHash` must include `revoked_at IS NULL AND expires_at > $2`. Use parameterized queries only.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `pnpm --filter @seovista/worker test -- admin-auth`

Expected: PASS, with migration state including ID 7.

- [ ] **Step 6: Update migration expectation and run worker integration coverage**

Run: `pnpm --filter @seovista/worker test -- infrastructure`

Expected: PASS, including all existing job/RBAC/audit/cost tests and the new auth persistence behavior.

---

## Task 2: Server-Only Session Cookie and Login Contracts

**Files:**
- Create: `apps/web/src/lib/admin/db.ts`
- Create: `apps/web/src/lib/admin/session.ts`
- Create: `apps/web/app/admin/login/page.tsx`
- Create: `apps/web/app/admin/login/actions.ts`
- Create: `apps/web/app/admin/logout/route.ts`
- Test: `apps/web/tests/admin-auth.test.ts`

**Interfaces:**
- `createSessionService(dependencies)` exposes `authenticate(email, password)`, `getCurrentSession()`, `requireAuthenticatedUser()`, `startSession(userId)`, `revokeCurrentSession()`, and `clearSessionCookie()`.
- `SESSION_COOKIE_NAME` is `seovista_admin_session`.
- Cookie options are `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, `path: "/"`, and a bounded `maxAge` matching the database expiry.
- Use Node `crypto.scrypt` or `crypto.scryptSync` with a versioned stored format, random salt, constant-time verification, and a bounded max password length. Do not add an auth dependency.
- Every login attempt has a generic failure response. Do not disclose whether email or password was incorrect. Do not expose SQL or identity details.

- [ ] **Step 1: Write one failing session contract test**

```ts
it("creates a secure session cookie and resolves the same authenticated user", async () => {
  const cookies = createCookieJar();
  const service = createSessionService({ authRepository, cookies, now: fixedNow });
  await service.startSession("user-1");
  expect(cookies.set).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "seovista_admin_session",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    }),
  );
  expect(await service.getCurrentSession()).toMatchObject({ userId: "user-1" });
});
```

- [ ] **Step 2: Run the focused web test and verify it fails**

Run: `pnpm --filter @seovista/web test -- admin-auth`

Expected: FAIL because the session service does not exist.

- [ ] **Step 3: Implement token generation, hashing, verification, and cookie handling**

Generate 32 random bytes, store only SHA-256(token), set the cookie with the exact flags, and resolve the database record through `findActiveSessionByHash`. On invalid/expired/revoked session, delete the cookie and return unauthenticated. Never log token values.

- [ ] **Step 4: Add generic login behavior**

Use a server action or route-compatible action that validates email/password length with Zod or local guards, verifies the stored password hash, creates a session, redirects to `/admin/`, and redirects failures to `/admin/login/?error=invalid_credentials` without leaking account existence.

- [ ] **Step 5: Add logout behavior**

Accept POST only, revoke the current session, clear the cookie, and redirect to `/admin/login/`. Reject GET with `405` and `Allow: POST`.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm --filter @seovista/web test -- admin-auth`
Run: `pnpm --filter @seovista/web typecheck`

Expected: PASS with no server-only boundary diagnostics.

---

## Task 3: SeoVista RBAC Authorization

**Files:**
- Create: `apps/web/src/lib/admin/authorization.ts`
- Modify: `apps/worker/src/db/rbac.ts` only if read methods are missing
- Test: `apps/web/tests/admin-auth.test.ts` and worker RBAC integration coverage

**Interfaces:**
- Permission identities are namespaced constants:
  - `admin:overview:read`
  - `admin:jobs:read`
  - `admin:audits:read`
  - `admin:reports:read`
  - `admin:users:manage`
- `createAuthorizationService(rbacRepository)` exposes `hasPermission(subjectIdentity, permissionIdentity)` and `requirePermission(user, permissionIdentity)`.
- Denials return a stable unauthorized/forbidden result to the route layer. Do not use NextG’s role names as authorization logic.

- [ ] **Step 1: Write the failing permission behavior test**

```ts
it("allows Overview only when the SeoVista permission is granted", async () => {
  const authorization = createAuthorizationService(fakeRbac);
  expect(await authorization.hasPermission("user-1", "admin:overview:read")).toBe(true);
  expect(await authorization.hasPermission("user-2", "admin:overview:read")).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @seovista/web test -- admin-auth`

Expected: FAIL because permission lookup/evaluator does not exist.

- [ ] **Step 3: Add read methods to the RBAC repository**

Add `subjectHasPermission(subjectIdentity, permissionIdentity): Promise<boolean>` using a parameterized join across subject roles, role permissions, and permissions. Add seed support for one global `operator` role and `admin:overview:read` permission.

- [ ] **Step 4: Implement the authorization service**

Resolve the current authenticated user first, then evaluate the permission. `requirePermission` throws a typed forbidden error without returning role or permission internals to the client.

- [ ] **Step 5: Run focused worker and web tests**

Run: `pnpm --filter @seovista/worker test -- infrastructure`
Run: `pnpm --filter @seovista/web test -- admin-auth`

Expected: PASS.

---

## Task 4: Protected Admin Route Boundary and Private Metadata

**Files:**
- Create: `apps/web/src/lib/admin/metadata.ts`
- Create: `apps/web/app/admin/(protected)/layout.tsx`
- Create: `apps/web/app/admin/(protected)/loading.tsx`
- Create: `apps/web/app/admin/(protected)/error.tsx`
- Modify: `apps/web/middleware.ts`
- Test: `apps/web/tests/e2e/admin-auth.spec.ts` and route contract tests

**Interfaces:**
- `privateAdminMetadata(title, description)` returns Next metadata with `robots.index = false`, `robots.follow = false`, no canonical, and no public Open Graph graph.
- The protected layout calls `requireAuthenticatedUser()` and `requirePermission(user, ADMIN_PERMISSIONS.overviewRead)` before rendering children.
- `/admin/login/` is public; `/admin/` and all `/admin/(protected)` descendants require auth.

- [ ] **Step 1: Write the failing browser behavior test**

```ts
test("unauthenticated admin access redirects to login without public shell", async ({ page }) => {
  const response = await page.goto("/admin/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/admin\/login\//);
  await expect(page.locator("header[role='banner']")).toHaveCount(0);
  await expect(page.locator("main h1")).toContainText("Admin sign in");
});
```

- [ ] **Step 2: Run the focused browser test and verify it fails**

Run: `pnpm --filter @seovista/web test:e2e -- admin-auth.spec.ts`

Expected: FAIL because `/admin` has no route/login boundary.

- [ ] **Step 3: Implement route bypass and protected layout**

Update middleware so private admin paths are not redirected through public approved-path canonicalization. Make protected layout server-only and redirect unauthenticated users to `/admin/login/?returnTo=/admin/` after validating the return path is same-origin and starts with `/admin/`.

- [ ] **Step 4: Implement private metadata and login page**

Render a single `<main id="main">` with one `<h1>Admin sign in</h1>`, username/password fields, generic error text, and no public Header/Footer. Set private robots metadata.

- [ ] **Step 5: Run focused E2E and metadata assertions**

Run: `pnpm --filter @seovista/web test:e2e -- admin-auth.spec.ts`
Run: `pnpm --filter @seovista/web test -- admin-auth`

Expected: PASS. Unauthenticated access must not expose dashboard content, public navigation, or session details.

---

## Task 5: Overview Read Model and Server-Rendered Dashboard

**Files:**
- Create: `apps/worker/src/db/admin-overview.ts`
- Create: `apps/web/src/lib/admin/overview.ts`
- Create: `apps/web/src/components/admin/admin-shell.tsx`
- Create: `apps/web/src/components/admin/admin-stat-card.tsx`
- Create: `apps/web/src/components/admin/admin-status-list.tsx`
- Create: `apps/web/app/admin/(protected)/page.tsx`
- Create: `apps/web/tests/admin-overview.test.ts`
- Create: `apps/web/tests/e2e/admin-overview.spec.ts`

**Interfaces:**
- `createAdminOverviewRepository(client).readOverview(now)` returns serializable `AdminOverview`:
  - `activeUsers`
  - `jobs: { queued, running, completed, failed }`
  - `audits: { total, failed, denied }`
  - `costs: { amount, currency, count }`
  - `dependencies: { name, status }[]`
  - `recentActivity: { kind, label, status, occurredAt }[]`
- Query aggregates are read-only, parameterized, and return bounded recent activity (maximum 10 rows). Raw metadata, job payloads, email addresses, password hashes, session hashes, and connection values are never returned.
- Overview page uses NextG’s information hierarchy, not its data model: sidebar groups `Overview`, `Operations`, and `Security`; cards and status rows use existing SeoVista colors and server-rendered HTML.

- [ ] **Step 1: Write the failing read-model test**

```ts
it("returns bounded operational counters without secret fields", async () => {
  const overview = await createAdminOverviewRepository(fakeDb).readOverview(fixedNow);
  expect(overview.jobs.failed).toBe(1);
  expect(overview.recentActivity.length).toBeLessThanOrEqual(10);
  expect(JSON.stringify(overview)).not.toContain("metadata");
  expect(JSON.stringify(overview)).not.toContain("token");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @seovista/web test -- admin-overview`

Expected: FAIL because the read model does not exist.

- [ ] **Step 3: Implement aggregate queries and repository mapping**

Use SQL counts over `admin_users`, `job_records`, `audit_logs`, and `api_cost_ledger`, plus bounded unioned recent activity. Return zero-safe values and a fixed `USD`/ledger currency fallback only when the ledger is empty. Do not query or return report payloads in this first slice.

- [ ] **Step 4: Add server-only Overview loader**

Require the authenticated user and Overview permission, read the aggregate, and pass only the serializable DTO to the Server Component. Reuse `@seovista/ui` `Card`, `Container`, and `Section` where appropriate, adding no client state.

- [ ] **Step 5: Implement NextG-inspired shell and Overview page**

Build a private shell with:

- brand and current operator context;
- grouped sidebar links with disabled future modules clearly marked as unavailable rather than fake routes;
- active Overview state;
- sign-out POST form;
- responsive layout and keyboard-visible focus states;
- one main heading, metric cards, recent operational activity, and dependency status.

No fake customer, ranking, SEO score, or report metrics may be shown.

- [ ] **Step 6: Run focused unit, E2E, accessibility, and type checks**

Run: `pnpm --filter @seovista/web test -- admin-overview`
Run: `pnpm --filter @seovista/web test:e2e -- admin-overview.spec.ts`
Run: `pnpm --filter @seovista/web test:a11y -- admin-overview.spec.ts`
Run: `pnpm --filter @seovista/web typecheck`

Expected: PASS; private dashboard is not indexable and contains no public footer/header.

---

## Task 6: Security, Boundary, and Full Validation

**Files:**
- Modify only files required by failing checks from Tasks 1-5.
- Test: existing boundary, bootstrap, worker, web unit, E2E, accessibility, SEO, and release gates.

- [ ] **Step 1: Add negative security tests before final validation**

Cover:

- expired session cannot access `/admin`;
- revoked session cannot access `/admin`;
- disabled user cannot log in;
- invalid credentials have identical generic response shape;
- logout is POST-only;
- `/admin` has `noindex,nofollow` and is absent from canonical/sitemap/feed;
- password/session hashes never occur in rendered HTML or logs;
- missing permission produces forbidden behavior without role leakage;
- package boundary rejects browser imports of server-only code.

- [ ] **Step 2: Run focused suites**

Run: `pnpm --filter @seovista/worker test -- infrastructure`
Run: `pnpm --filter @seovista/web test -- admin-auth admin-overview`
Run: `pnpm --filter @seovista/web typecheck`
Run: `pnpm --filter @seovista/web lint`

- [ ] **Step 3: Run repository quality gates**

Run: `pnpm test`
Run: `pnpm run verify-package-boundaries`
Run: `pnpm lint`
Run: `pnpm typecheck`
Run: `pnpm build`
Run: `pnpm test:e2e`
Run: `pnpm test:a11y`
Run: `pnpm test:seo`

- [ ] **Step 4: Run release validation without changing unrelated work**

Run: `pnpm release --skip-lighthouse --stop-on-first-failure`

Expected: all applicable gates pass, including the new admin tests, with teardown exit code 0.

- [ ] **Step 5: Verify cleanup and working tree**

Confirm no SeoVista containers/listeners remain on ports `55432` and `56379`. Run `git status --short` and inspect only files changed by this plan plus pre-existing user changes. Do not delete, clean, commit, or push generated/untracked artifacts without explicit permission.

---

## Self-Review

- **Spec coverage:** custom PostgreSQL sessions are covered by Tasks 1-2; login/logout and protected routing by Tasks 2 and 4; SeoVista RBAC by Task 3; NextG-referenced shell and Overview by Task 5; private indexing, package boundaries, secrets, and full validation by Task 6.
- **No unresolved options:** first slice deliberately uses a global operator with optional future organization tables. It does not silently copy NextG multi-tenancy.
- **No NextG/Payload coupling:** only UI/UX and test behavior are references. SeoVista repositories, tables, permissions, audit constraints, and content policies remain authoritative.
- **Validation boundary:** worker integration tests use the existing lifecycle setup; web tests use dependency injection and Playwright rather than reading secrets or bypassing public interfaces.
