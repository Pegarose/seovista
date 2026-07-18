## Task 5: Secure Preview Exchange

**Files:**
- Create: `apps/web/app/api/preview/exchange/route.ts`
- Create: `apps/web/src/lib/cms/preview-cookie.ts`

**Interfaces:**
- Consumes: Hashed token verification against `cms_preview_grants`.
- Produces: Standardized Set-Cookie mechanism resulting in `no-store` redirects.

- [ ] **Step 1: Define preview cookie helpers**

```typescript
// apps/web/src/lib/cms/preview-cookie.ts
import { cookies } from "next/headers";

export const PREVIEW_COOKIE_NAME = "seovista_preview_grant";

export async function setPreviewCookie(grantId: string, expiresAt: Date) {
  (await cookies()).set(PREVIEW_COOKIE_NAME, grantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearPreviewCookie() {
  (await cookies()).delete(PREVIEW_COOKIE_NAME);
}

export async function getPreviewGrantContext(): Promise<string | null> {
  return (await cookies()).get(PREVIEW_COOKIE_NAME)?.value || null;
}
```

- [ ] **Step 2: Create the exchange endpoint**

```typescript
// apps/web/app/api/preview/exchange/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/src/lib/admin/db";
import { setPreviewCookie } from "@/src/lib/cms/preview-cookie";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const path = request.nextUrl.searchParams.get("path") || "/";

  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const hash = createHash("sha256").update(token).digest("base64url");
  const db = getAdminDb();
  
  // Verify token
  const res = await db.query(
    `UPDATE cms_preview_grants 
     SET exchanged_at = now() 
     WHERE token_hash = $1 AND expires_at > now() AND revoked_at IS NULL AND exchanged_at IS NULL
     RETURNING id, expires_at`,
    [hash]
  );
  
  if (res.rowCount === 0) {
    return new NextResponse("Invalid or expired preview grant", { status: 403 });
  }

  const grant = res.rows[0];
  await setPreviewCookie(grant.id, grant.expires_at);

  return NextResponse.redirect(new URL(path, request.url));
}
```

- [ ] **Step 3: Run build confirmation**

Run: `pnpm --filter @seovista/web build`
Expected: Passes Next.js route compilation.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/preview/exchange/route.ts apps/web/src/lib/cms/preview-cookie.ts
git commit -m "feat(web): enforce secure hash-based preview token exchange"
```

---

## Task 6: Testing Core Projection Boundaries

**Files:**
- Create: `apps/web/tests/domain/public-projections.test.ts`
- Modify: `apps/web/tests/e2e/routes.spec.ts` (if Playwright overrides needed for preview mode checks).

**Interfaces:**
- Produces: Vitest proof that Drafts/Private records never appear in `siteMap`, `JSON-LD`, or HTML.

- [ ] **Step 1: Write the failing projection isolation test**
