import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAdminDb } from "../../../../src/lib/admin/db";
import { setPreviewCookie } from "../../../../src/lib/cms/preview-cookie";
import { requireAdminUser } from "../../../../src/lib/admin/session";
import { requireCmsCapability, CmsCapabilities } from "../../../../src/lib/cms/capabilities";

export async function GET(request: NextRequest) {
  // Enforce authentication & authorization before handling preview tokens
  const user = await requireAdminUser();
  await requireCmsCapability(user, CmsCapabilities.Preview);

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
  if (!grant) {
    return new NextResponse("Invalid or expired preview grant block", { status: 403 });
  }

  await setPreviewCookie(grant.id, grant.expires_at);

  return NextResponse.redirect(new URL(path, request.url));
}
