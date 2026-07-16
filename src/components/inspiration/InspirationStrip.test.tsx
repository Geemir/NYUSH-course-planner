// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { InspirationStrip } from "@/components/inspiration/InspirationStrip";
import {
  INSPIRATION_QUOTES,
  INSPIRATION_QUOTE_KEY,
} from "@/lib/inspirationQuotes";
import { render, screen, waitFor } from "@/test/render";

describe("InspirationStrip", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("shows the quote selected for this browser session", async () => {
    const selected = INSPIRATION_QUOTES[1];
    window.sessionStorage.setItem(INSPIRATION_QUOTE_KEY, selected.id);

    render(<InspirationStrip />);

    await waitFor(() =>
      expect(screen.getByText(selected.text, { exact: false })).toBeDefined(),
    );
    expect(screen.getByRole("button", { name: "Show another thought" })).toBeDefined();
  });

  it("moves to the next quote and persists it when refreshed", async () => {
    const user = userEvent.setup();
    const current = INSPIRATION_QUOTES[0];
    const next = INSPIRATION_QUOTES[1];
    window.sessionStorage.setItem(INSPIRATION_QUOTE_KEY, current.id);
    render(<InspirationStrip />);
    await waitFor(() =>
      expect(screen.getByText(current.text, { exact: false })).toBeDefined(),
    );

    await user.click(
      screen.getByRole("button", { name: "Show another thought" }),
    );

    expect(screen.getByText(next.text, { exact: false })).toBeDefined();
    expect(window.sessionStorage.getItem(INSPIRATION_QUOTE_KEY)).toBe(next.id);
  });
});
