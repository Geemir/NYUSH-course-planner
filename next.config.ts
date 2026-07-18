import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads WebAssembly and filesystem assets with native Node APIs.
  // Keeping it external avoids Turbopack rewriting its asset URLs.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
