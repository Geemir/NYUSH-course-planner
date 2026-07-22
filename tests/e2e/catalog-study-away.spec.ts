import { test, expect } from "./support/fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const skip = page.getByRole("button", { name: "Skip guide" });
  if (await skip.isVisible()) await skip.click();
});

test("discovers Shanghai and New York catalog records with trust copy", async ({ page }) => {
  const search = page.getByRole("textbox", { name: "Search courses" });
  await search.fill("Elementary Arabic");
  await expect(page.getByText("Elementary Arabic I")).toBeVisible();

  await search.fill("Study Away Seminar");
  await expect(page.getByText("New York study-away catalog").first()).toBeVisible();
  await expect(page.getByText("Availability and registration eligibility not confirmed").first()).toBeVisible();
  await expect(page.getByText(/Study Away Seminar/).first()).toBeVisible();
});

test("catalog filters are semantic and bounded", async ({ page }) => {
  await page.getByRole("combobox", { name: "Campus" }).click();
  await page.getByRole("option", { name: "New York" }).click();
  await expect(page.getByText("New York study-away catalog").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Clear filters/ })).toBeVisible();
});
