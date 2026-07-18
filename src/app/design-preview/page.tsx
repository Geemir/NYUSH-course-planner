import { notFound } from "next/navigation";
import { AcademicGlassPrototype } from "@/components/design/AcademicGlassPrototype";

export const metadata = { title: "Academic Glass Preview · NYUSH Degree Planner" };

export default function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AcademicGlassPrototype />;
}
