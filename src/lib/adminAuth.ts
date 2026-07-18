import { auth } from "@/auth";

export type AdminGate =
  | { ok: true }
  | { error: "unauthorized"; status: 401 }
  | { error: "forbidden"; status: 403 };

/** Shared admin authorization contract for protected Route Handlers. */
export async function requireAdmin(): Promise<AdminGate> {
  const gate = await requireAdminUser();
  return "ok" in gate ? { ok: true } : gate;
}

export type AdminUserGate =
  | { ok: true; userId: string }
  | { error: "unauthorized"; status: 401 }
  | { error: "forbidden"; status: 403 };

export async function requireAdminUser(): Promise<AdminUserGate> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "unauthorized", status: 401 };
  }
  if (session.user.role !== "admin") {
    return { error: "forbidden", status: 403 };
  }
  return { ok: true, userId: session.user.id };
}
