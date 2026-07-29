import { test, expect } from "./support/fixtures";

async function dismissGuide(page: import("@playwright/test").Page) {
  const skip = page.getByRole("button", { name: "Skip guide" });
  if (await skip.isVisible()) await skip.click();
}

test("sign-in keeps email visibly unavailable and exposes no email form", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByText("Email sign-in - In development")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);
  await expect(page.getByText("Google sign-in is temporarily unavailable.")).toBeVisible();
});

test("announcement is mobile-safe, dismissible, and remains hidden on reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissGuide(page);
  await expect(page.getByRole("region", { name: "Planner announcement" })).toContainText("E2E advising reminder");
  await page.getByRole("button", { name: "Dismiss announcement" }).click();
  await expect(page.getByRole("region", { name: "Planner announcement" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Planner announcement" })).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

for (const item of [
  { name: "Export JSON backup", extension: ".json" },
  { name: "Export Excel workbook", extension: ".xlsx" },
  { name: "Export PDF report", extension: ".pdf" },
]) {
  test(`${item.name} downloads the expected file`, async ({ page }) => {
    await page.goto("/");
    await dismissGuide(page);
    await page.getByRole("button", { name: "Plan actions" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: item.name }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\${item.extension}$`));
  });
}

test("administrator can draft, publish, and withdraw a notice", async ({ adminPage }) => {
  await adminPage.goto("/admin");
  await expect(adminPage.getByRole("heading", { name: "Planner announcements" })).toBeVisible();
  await adminPage.getByLabel("Title").fill("Registration update");
  await adminPage.getByLabel("Message").fill("Check Albert before registration.");
  await adminPage.getByRole("button", { name: "Save draft" }).click();
  await expect(adminPage.getByText("Registration update")).toBeVisible();
  adminPage.once("dialog", (dialog) => dialog.accept());
  await adminPage.getByRole("button", { name: "Publish Registration update" }).click();
  await expect(adminPage.getByRole("button", { name: "Withdraw Registration update" })).toBeVisible();
  adminPage.once("dialog", (dialog) => dialog.accept());
  await adminPage.getByRole("button", { name: "Withdraw Registration update" }).click();
  await expect(adminPage.getByText("Archived").first()).toBeVisible();
});
