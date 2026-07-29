import { test as base, expect, type Page } from "@playwright/test";
import { authenticateAs } from "./auth";

type PlannerFixtures = { studentPage: Page; adminPage: Page };

export async function preparePlanner(page: Page, programId = "computer-science-bs") {
  await page.addInitScript((primaryMajorId) => {
    localStorage.setItem("nyush-planner:onboarding:v1", "completed");
    localStorage.setItem("nyush-progress-guide", JSON.stringify({ version: 1 }));
    localStorage.setItem("nyush-planner-v1", JSON.stringify({
      state: {
        activePrograms: ["core", primaryMajorId],
        programProfile: {
          coreProgramId: "core",
          primaryMajorId,
          secondMajorId: null,
          minorIds: [],
        },
      },
      version: 0,
    }));
  }, programId);
  await page.goto("/");
  await page.getByRole("main").waitFor();
  const migration = page.getByRole("dialog", { name: "Review your updated Program Profile" });
  await migration.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (await migration.isVisible()) {
    await migration.getByLabel("Primary major").selectOption(programId);
    await migration.getByLabel("Second major (optional)").selectOption("");
    await migration.getByRole("button", { name: "Continue" }).click();
  }
}

export async function openProgressFor(page: Page, programId: string) {
  await preparePlanner(page, programId);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  const gotIt = page.getByRole("button", { name: /got it/i });
  if (await gotIt.isVisible()) await gotIt.click();
  await expect(page.getByRole("dialog", { name: "Degree Progress", exact: true })).toBeVisible();
}

export const test = base.extend<PlannerFixtures>({
  studentPage: async ({ browser }, provide) => {
    const context = await browser.newContext();
    await authenticateAs(context, "student");
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
  adminPage: async ({ browser }, provide) => {
    const context = await browser.newContext();
    await authenticateAs(context, "admin");
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

export { expect };
