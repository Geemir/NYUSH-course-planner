// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Button } from "@/components/ui/button";

it("renders an accessible button name", () => {
  render(<Button>Guide</Button>);
  expect(screen.getByRole("button", { name: "Guide" })).toBeDefined();
});
