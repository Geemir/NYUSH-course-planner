import { test, expect } from "./support/fixtures";

test("first visit opens the English guide and it can be reopened", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Choose your program" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Find courses" })).toBeVisible();
  await page.getByRole("button", { name: "Skip guide" }).click();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Choose your program" })).toBeVisible();
});

test("student reaches the planner while admin authorization remains server-side", async ({ studentPage, adminPage }) => {
  await studentPage.goto("/");
  const migration = studentPage.getByRole("dialog", { name: "Review your updated Program Profile" });
  if (await migration.isVisible()) await migration.getByRole("button", { name: "Continue" }).click();
  await expect(studentPage.getByRole("main")).toBeVisible();
  await studentPage.goto("/admin");
  await expect(studentPage.getByRole("heading", { name: "Admins only" })).toBeVisible();

  await adminPage.goto("/admin");
  await expect(adminPage.getByRole("heading", { name: "Catalog Admin" })).toBeVisible();
});

test("Program Profile is NYUSH-scoped and supports optional planning roles", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip guide" }).click();
  await page.getByRole("button", { name: "Edit Program Profile" }).click();
  await expect(page.getByRole("dialog", { name: /Program Profile/ })).toBeVisible();
  await expect(page.getByLabel("Primary major")).toBeVisible();
  await expect(page.getByLabel("Second major (optional)")).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search programs" })).toBeVisible();
  await expect(page.getByText(/New York degree/i)).toHaveCount(0);
});
