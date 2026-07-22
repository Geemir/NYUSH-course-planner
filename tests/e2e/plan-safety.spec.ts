import { test, expect } from "./support/fixtures";

test("planner exposes one-column semesters, sync state, and reversible controls", async ({ studentPage }) => {
  await studentPage.goto("/");
  const migration = studentPage.getByRole("dialog", { name: "Review your updated Program Profile" });
  if (await migration.isVisible()) await migration.getByRole("button", { name: "Continue" }).click();
  const skip = studentPage.getByRole("button", { name: "Skip guide" });
  if (await skip.isVisible()) await skip.click();
  await expect(studentPage.getByText(/Saved|Saving|Offline|Couldn't sync/).first()).toBeVisible();
  await expect(studentPage.getByRole("button", { name: /Undo/i })).toBeVisible();
  const semesters = studentPage.locator('[data-testid^="semester-"]');
  await expect(semesters.first()).toBeVisible();
});

test("plan actions keep import, export, and reset behind one named menu", async ({ page }) => {
  await page.goto("/");
  const skip = page.getByRole("button", { name: "Skip guide" });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole("button", { name: "Plan actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Import plan" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export plan" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reset plan" })).toBeVisible();
});
