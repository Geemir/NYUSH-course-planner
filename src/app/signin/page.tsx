"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Mail } from "lucide-react";
import { getProviders, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

type GoogleState = "loading" | "available" | "unavailable";

export default function SignInPage() {
  const [googleState, setGoogleState] = useState<GoogleState>("loading");

  useEffect(() => {
    let active = true;
    getProviders()
      .then((providers) => {
        if (active) {
          setGoogleState(providers?.google ? "available" : "unavailable");
        }
      })
      .catch(() => {
        if (active) setGoogleState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <GraduationCap className="size-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            NYUSH Course Planner
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your NYU Google account to save your plan.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {googleState === "loading" && (
            <Button className="min-h-11 w-full" disabled aria-label="Loading Google sign-in">
              Loading Google sign-in…
            </Button>
          )}
          {googleState === "available" && (
            <Button
              className="min-h-11 w-full"
              onClick={() => signIn("google", { callbackUrl: "/" })}
            >
              <span aria-hidden className="font-semibold">G</span>
              Continue with Google
            </Button>
          )}
          {googleState === "unavailable" && (
            <p
              role="status"
              className="rounded-xl border border-border bg-muted/40 p-3 text-center text-sm text-muted-foreground"
            >
              Google sign-in is temporarily unavailable.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full whitespace-normal"
            disabled
          >
            <Mail className="size-4" aria-hidden />
            Email sign-in - In development
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          You can keep planning without signing in — your work stays on this
          device until you log in.
        </p>
      </div>
    </main>
  );
}
