import { test as base, expect, type Page } from "@playwright/test";
import { authenticateAs } from "./auth";

type PlannerFixtures = { studentPage: Page; adminPage: Page };

export const test = base.extend<PlannerFixtures>({
  studentPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    await authenticateAs(context, "student");
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    await authenticateAs(context, "admin");
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
