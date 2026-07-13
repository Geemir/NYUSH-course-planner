"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Mail } from "lucide-react";
import { getProviders, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauth, setOauth] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    getProviders().then((p) => {
      if (!p) return;
      setOauth(
        Object.values(p)
          .filter((x) => x.type === "oidc" || x.type === "oauth")
          .map((x) => ({ id: x.id, name: x.name })),
      );
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.toLowerCase().endsWith("@nyu.edu")) {
      setError("Please use your NYU email (must end in @nyu.edu).");
      return;
    }
    await signIn("nyu-email", { email, callbackUrl: "/", redirect: false });
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <GraduationCap className="size-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            NYUSH Course Planner
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your NYU email to save your plan.
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-center text-sm">
            <Mail className="mx-auto mb-2 size-5 text-primary" />
            Check your NYU email for a sign-in link.
            <p className="mt-2 text-xs text-muted-foreground">
              (Local dev: the link is printed in the server console.)
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input
              type="email"
              required
              placeholder="netid@nyu.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Email me a sign-in link
            </Button>
          </form>
        )}

        {oauth.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or{" "}
              <span className="h-px flex-1 bg-border" />
            </div>
            {oauth.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="w-full"
                onClick={() => signIn(p.id, { callbackUrl: "/" })}
              >
                Continue with {p.name}
              </Button>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          You can keep planning without signing in — your work stays on this
          device until you log in.
        </p>
      </div>
    </div>
  );
}
