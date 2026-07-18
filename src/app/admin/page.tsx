import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminCourses } from "@/components/admin/AdminCourses";
import { AdminRules } from "@/components/admin/AdminRules";
import { AlbertImport } from "@/components/admin/AlbertImport";
import { AdminCorrections } from "@/components/admin/AdminCorrections";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Admin · NYUSH Course Planner" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  if (session.user.role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Admins only</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your account ({session.user.email}) isn&apos;t an admin. Ask an
          administrator to add your NYU email to the <code>ADMIN_EMAILS</code>{" "}
          allowlist.
        </p>
        <Button nativeButton={false} render={<Link href="/" />}>
          Back to planner
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Catalog Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            Review catalog corrections and maintain planner data. Signed in as{" "}
            {session.user.email}.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Back to planner
        </Button>
      </header>
      <AdminCorrections />
      <AlbertImport />
      <AdminRules />
      <AdminCourses />
    </div>
  );
}
