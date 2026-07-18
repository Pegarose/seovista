"use server";

import { redirect } from "next/navigation";
import { authenticateAdmin } from "./session";
import { safeAdminReturnPath } from "./return-path";

export interface AuthenticateState {
  error?: string;
  success?: boolean;
}

export async function authenticateAction(_prevState: AuthenticateState, formData: FormData): Promise<AuthenticateState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const returnTo = safeAdminReturnPath(formData.get("returnTo") as string | null);

  if (typeof email !== "string" || email.trim() === "" || typeof password !== "string" || password.trim() === "") {
    return { error: "Email and password are required." };
  }

  const user = await authenticateAdmin(email.trim(), password);

  if (!user) {
    return { error: "Email or password is invalid." };
  }

  redirect(returnTo);
}
