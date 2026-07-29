import { test, expect, preparePlanner } from "./support/fixtures";

test("planner exposes one-column semesters, sync state, and reversible controls", async ({ studentPage }) => {
  await preparePlanner(studentPage);
  await expect(studentPage.getByText(/Saved|Saving|Offline|Couldn't sync|Review the plan migration/).first()).toBeVisible();
  await expect(studentPage.getByRole("button", { name: /Undo/i })).toBeVisible();
  const semesters = studentPage.locator('[data-testid^="semester-"]');
  await expect(semesters.first()).toBeVisible();
});

test("plan actions keep import, export, and reset behind one named menu", async ({ page }) => {
  await preparePlanner(page);
  await page.getByRole("button", { name: "Plan actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Import plan" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export JSON backup" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export Excel workbook" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export PDF report" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reset plan" })).toBeVisible();
});
