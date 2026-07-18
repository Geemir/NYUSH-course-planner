import type { BrowserContext } from "@playwright/test";

export async function authenticateAs(context: BrowserContext, role: "student" | "admin") {
  await context.addCookies([{
    name: "authjs.session-token",
    value: `e2e-${role}-session`,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    expires: new Date("2099-01-01T00:00:00.000Z").getTime() / 1000,
  }]);
}
