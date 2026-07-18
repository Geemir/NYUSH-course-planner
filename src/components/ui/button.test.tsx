// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

it("renders an accessible button name", () => {
  render(<Button>Guide</Button>);
  expect(screen.getByRole("button", { name: "Guide" })).toBeDefined();
});

it("maps semantic variants and control heights", () => {
  const { rerender } = render(<Button variant="primary">Continue</Button>);
  expect(screen.getByRole("button").className).toContain("h-11");
  rerender(<Button variant="quiet" size="compact">More</Button>);
  expect(screen.getByRole("button").className).toContain("h-9");
  rerender(<Button variant="danger" size="prominent">Delete</Button>);
  expect(screen.getByRole("button").className).toContain("h-13");
  rerender(<Button size="icon" aria-label="Settings">S</Button>);
  expect(screen.getByRole("button").className).toContain("min-h-11");
});

it("prevents activation and exposes busy state while loading", async () => {
  const action = vi.fn(); const user = userEvent.setup();
  render(<Button loading onClick={action}>Save</Button>);
  const button = screen.getByRole("button", { name: "Save" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.hasAttribute("disabled")).toBe(true);
  await user.click(button);
  expect(action).not.toHaveBeenCalled();
});
