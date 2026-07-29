import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminCourses } from "@/components/admin/AdminCourses";
import { AdminRules } from "@/components/admin/AdminRules";
import { AlbertImport } from "@/components/admin/AlbertImport";
import { AdminCorrections } from "@/components/admin/AdminCorrections";
import { AdminAnnouncements } from "@/components/admin/AdminAnnouncements";
import { CatalogMaintenance } from "@/components/admin/CatalogMaintenance";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Admin · NYUSH Course Planner" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  if (session.user.role !== "admin" && session.user.role !== "maintainer") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Maintainers only</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your account ({session.user.email}) cannot maintain catalog data. Ask an
          administrator to assign the maintainer role.
        </p>
        <Button nativeButton={false} render={<Link href="/" />}>
          Back to planner
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5 sm:p-6">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Catalog Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            Publish planner announcements, review corrections, and maintain catalog data. Signed in as{" "}
            {session.user.email}.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Back to planner
        </Button>
      </header>
      <CatalogMaintenance />
      {session.user.role === "admin" && <>
        <AdminAnnouncements />
        <AdminCorrections />
        <AlbertImport />
        <AdminRules />
        <AdminCourses />
      </>}
    </div>
  );
}
