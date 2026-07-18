# Admin Auth & Layout Architecture (Next.js App Router)

## 1. Overview
The SeoVista Admin console is a secure area under the `/admin` path. Any access to `/admin/*` requires a valid operator session. If the user is unauthenticated, they will be forcibly redirected to `/admin/login` (except when already on the login page). The authentication heavily relies on Server Components to ensure zero exposure of private data, using a secure database backing session validation and credential cross-checks.

## 2. Shared Libraries and Utilities
The underlying authentication structures are defined in `apps/worker/src/db/admin-auth.ts`, establishing interfaces such as `AdminUser`, `AdminSession`, `CreateAdminUser`, and `CreateAdminSession`. It implements `AdminAuthRepository` which encapsulates the PostgreSQL queries necessary to validate passwords, issue sessions, verify tokens by mapping a hash, and revoking them.

The Next.js integration resides in `apps/web/src/lib/admin/session.ts`. This library uses `server-only`, leveraging `AdminAuthRepository` to provide utility functions like `startAdminSession`, `getCurrentAdminUser`, `requireAdminUser`, and `revokeCurrentAdminSession`. It handles creating secure, HTTP-only, SameSite=Lax session cookies that encapsulate the token validation checks.

## 3. Server Component based Route Protection
In the Next.js App Router paradigm, layout components act as a top-level interception points.
In `apps/web/app/admin/layout.tsx`:
- It leverages the standard `Metadata` capabilities alongside Server Components.
- Retrieves `x-seovista-pathname` from the headers (typically put by middleware) to bypass the layout for login pages (i.e. to avoid redirection loop into `/admin/login`).
- `getCurrentAdminUser()` interacts with cookies, calling back into the worker database (`admin-auth.ts`).
- If no user object is returned, a Next.js `redirect("/admin/login/")` throws an internal Server Action redirection mechanism to send the HTTP response to the browser with status 307.
- If valid, renders the nested route alongside an `<AdminShell>` context structure.

## 4. Admin Login Flow (Server Actions)
The login screen (`apps/web/app/admin/login/page.tsx`) renders `LoginForm` (`apps/web/src/components/admin/login-form.tsx`).

To adhere to Next.js App Router standards and serverless-like operational logic:
- The `LoginForm` should not post directly to an obsolete API route like `/api/admin/login` if possible, but rather dispatch a `Server Action`.
- The `Server Action` will reside in a specialized module or at the top of the form file with `"use server"`.
- It will invoke `authenticateAdmin(email, password)` directly from `apps/web/src/lib/admin/session.ts`. 
- `authenticateAdmin` maps to `createAdminAuthRepository(getAdminDb()).findUserByEmail(email)` (which comes from `apps/worker/src/db/admin-auth.ts`). 
- It validates the hash, invokes `startAdminSession(user.id)`, and calls `redirect(returnTo)` immediately upon success.
- This ensures all secrets and crypto operations reside entirely on the backend, and nothing is serialized to the client during transit.

In summary, `admin-auth.ts` remains the database abstraction, `session.ts` acts as the bridge connecting Next.js Cookies & Context, `layout.tsx` enforces the strict boundaries on the server side, and `Server Actions` manage the session injection avoiding separate REST API calls.
