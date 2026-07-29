import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYUSH Course Planner",
  description:
    "An interactive four-year course planner for students across all NYU Shanghai majors, with Bulletin requirements, prerequisites, study away, and live degree progress.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <LocaleProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
