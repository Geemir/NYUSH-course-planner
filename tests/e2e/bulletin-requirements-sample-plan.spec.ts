import { test, expect, openProgressFor } from "./support/fixtures";

test("Data Science renders its probability choice as source rows without a manual action", async ({ page }) => {
  await openProgressFor(page, "data-science-bs");
  await page.getByRole("button", { name: /Data Science \(BS\)/ }).click();

  await expect(page.getByText(/Select one of the following:/).first()).toBeVisible();
  await expect(page.getByText(/MATH-SHU 235.*Probability and Statistics/).first()).toBeVisible();
  await expect(page.getByText(/MATH-SHU 238.*Honors Theory of Probability/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /mark.*fulfilled/i })).toHaveCount(0);
});

test("Computer Science sample plan previews, applies, and undoes placeholders", async ({ page }) => {
  await openProgressFor(page, "computer-science-bs");
  await page.getByRole("button", { name: /Computer Science \(BS\)/ }).click();
  await expect(page.getByText(/Select four of the Computer Science Electives/i)).toBeVisible();
  await expect(page.getByText("Chinese or EAP").first()).toBeVisible();

  await page.getByRole("button", { name: "Use this sample plan" }).click();
  const preview = page.getByRole("dialog", { name: "Preview sample plan" });
  await expect(preview.getByText("Chinese or EAP").first()).toBeVisible();
  await preview.getByRole("button", { name: "Apply selected" }).click();
  await page.keyboard.press("Escape");

  const slots = page.locator('[data-testid^="planning-slot-"]');
  await expect(slots.first()).toBeVisible();
  await page.getByRole("button", { name: /Undo: Apply sample study plan/i }).click();
  await expect(slots).toHaveCount(0);
});
