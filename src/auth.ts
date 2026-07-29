import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

const NYU_DOMAIN = "@nyu.edu";

export interface AuthProviderEnv {
  AUTH_GOOGLE_ID?: string;
}

export function isNyuEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().endsWith(NYU_DOMAIN);
}

export function resolveSessionRole(
  email: string | null | undefined,
  storedRole: "student" | "maintainer" | "admin" | null | undefined,
  adminEmails: ReadonlySet<string> = ADMIN_EMAILS,
  maintainerEmails: ReadonlySet<string> = MAINTAINER_EMAILS,
): "student" | "maintainer" | "admin" {
  const normalizedEmail = (email ?? "").toLowerCase();
  if (adminEmails.has(normalizedEmail) || storedRole === "admin") return "admin";
  if (maintainerEmails.has(normalizedEmail) || storedRole === "maintainer") return "maintainer";
  return "student";
}

/** Config-driven admin allowlist (comma-separated emails in ADMIN_EMAILS). */
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Config-driven catalog maintainer allowlist (comma-separated NYU emails). */
const MAINTAINER_EMAILS = new Set(
  (process.env.MAINTAINER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Builds providers from one explicit environment snapshot for safe testing. */
export function buildProviders(env: AuthProviderEnv): Provider[] {
  return env.AUTH_GOOGLE_ID ? [Google] : [];
}

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  providers: buildProviders({ AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID }),
  callbacks: {
    /** Hard gate: only @nyu.edu identities may sign in. */
    signIn({ user, profile }) {
      return isNyuEmail(user?.email ?? profile?.email);
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        const dbRole = (user as { role?: "student" | "maintainer" | "admin" }).role;
        // Privileged roles are granted by their allowlist or a stored role.
        session.user.role = resolveSessionRole(session.user.email, dbRole);
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
