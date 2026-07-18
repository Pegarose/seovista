import { NextResponse } from "next/server";
import { revokeCurrentAdminSession } from "../../../../src/lib/admin/session";

export async function POST(request: Request): Promise<NextResponse> {
  await revokeCurrentAdminSession();
  return NextResponse.redirect(new URL("/admin/login/", request.url), 303);
}
