import { test, expect } from "./support/fixtures";

test("student correction entry point states the non-official boundary", async ({ studentPage }) => {
  await studentPage.goto("/");
  const migration = studentPage.getByRole("dialog", { name: "Review your updated Program Profile" });
  if (await migration.isVisible()) await migration.getByRole("button", { name: "Continue" }).click();
  const skip = studentPage.getByRole("button", { name: "Skip guide" });
  if (await skip.isVisible()) await skip.click();
  await studentPage.getByRole("button", { name: "Help" }).click();
  await studentPage.getByRole("menuitem", { name: "Report another issue" }).click();
  await expect(studentPage.getByRole("dialog", { name: /Report/ })).toBeVisible();
  await expect(studentPage.getByText(/not an official NYU/i)).toBeVisible();
});

test("student is denied admin while administrator sees Correction Inbox", async ({ studentPage, adminPage }) => {
  const denied = await studentPage.request.get("/api/admin/corrections");
  expect(denied.status()).toBe(403);
  await adminPage.goto("/admin");
  await expect(adminPage.getByText("Correction Inbox")).toBeVisible();
});
