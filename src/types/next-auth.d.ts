import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "student" | "maintainer" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "student" | "maintainer" | "admin";
  }
}
