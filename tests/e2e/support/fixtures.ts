import { test as base, expect, type Page } from "@playwright/test";
import { authenticateAs } from "./auth";

type PlannerFixtures = { studentPage: Page; adminPage: Page };

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
