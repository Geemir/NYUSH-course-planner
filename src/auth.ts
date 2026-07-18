import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

const NYU_DOMAIN = "@nyu.edu";

export interface AuthProviderEnv {
  NODE_ENV?: string;
  AUTH_MICROSOFT_ENTRA_ID_ID?: string;
  AUTH_GOOGLE_ID?: string;
}

export function isNyuEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().endsWith(NYU_DOMAIN);
}

export function resolveSessionRole(
  email: string | null | undefined,
  storedRole: "student" | "admin" | null | undefined,
  adminEmails: ReadonlySet<string> = ADMIN_EMAILS,
): "student" | "admin" {
  return adminEmails.has((email ?? "").toLowerCase()) || storedRole === "admin"
    ? "admin"
    : "student";
}

/** Config-driven admin allowlist (comma-separated emails in ADMIN_EMAILS). */
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Dev/local sign-in: a passwordless magic-link provider whose "email" is just
 * logged to the server console (no SMTP needed). In production, set the
 * Microsoft Entra or Google env vars and those OAuth providers activate.
 * All three use database sessions via the Drizzle adapter, so the prod path
 * is exercised the same way locally.
 */
const devMagicLink: Provider = {
  id: "nyu-email",
  type: "email",
  name: "NYU Email (dev link)",
  from: "no-reply@nyush-planner.local",
  maxAge: 10 * 60,
  options: {},
  async sendVerificationRequest({
    identifier,
    url,
  }: {
    identifier: string;
    url: string;
  }) {
    console.log(
      `\n[auth] NYU sign-in link for ${identifier}:\n${url}\n(dev only — paste this URL to finish signing in)\n`,
    );
  },
} as Provider;

/** Builds providers from one explicit environment snapshot for safe testing. */
export function buildProviders(env: AuthProviderEnv): Provider[] {
  const providers: Provider[] = [];
  if (env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    providers.push(MicrosoftEntraID);
  }
  if (env.AUTH_GOOGLE_ID) {
    providers.push(Google);
  }
  if (env.NODE_ENV !== "production") {
    providers.push(devMagicLink);
  }
  return providers;
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
  providers: buildProviders(process.env),
  callbacks: {
    /** Hard gate: only @nyu.edu identities may sign in. */
    signIn({ user, profile }) {
      return isNyuEmail(user?.email ?? profile?.email);
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        const dbRole = (user as { role?: "student" | "admin" }).role;
        // Admin is granted by the ADMIN_EMAILS allowlist or a stored role.
        session.user.role = resolveSessionRole(session.user.email, dbRole);
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
