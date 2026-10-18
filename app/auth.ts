import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { OrbitIdentity } from "../lib/access-auth";
export async function getUser(): Promise<OrbitIdentity | null> {
  const h = await headers();
  const userId = h.get("x-orbit-user-id"),
    email = h.get("x-orbit-user-email");
  if (!userId || !email) return null;
  let name = email.split("@")[0];
  try {
    name = decodeURIComponent(h.get("x-orbit-user-name") ?? name);
  } catch {}
  return { userId, email, displayName: name, fullName: name };
}
export async function requireUser() {
  const user = await getUser();
  if (user) return user;
  redirect("/auth/sign-in");
}
