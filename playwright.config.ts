import { defineConfig, devices } from "@playwright/test";

const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm.cmd run build && npm.cmd run e2e:seed && npm.cmd run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      PGLITE_DIR: process.env.PGLITE_DIR ?? ".pglite-e2e",
      AUTH_SECRET: "e2e-only-secret-not-for-production",
      AUTH_TRUST_HOST: "true",
      AUTH_URL: baseURL,
      NEXTAUTH_URL: baseURL,
      ADMIN_EMAILS: "admin@nyu.edu",
    },
  },
});
