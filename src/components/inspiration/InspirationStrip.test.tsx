// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InspirationStrip } from "@/components/inspiration/InspirationStrip";
import { INSPIRATION_QUOTES, INSPIRATION_QUOTE_KEY } from "@/lib/inspirationQuotes";
import { render, screen, waitFor } from "@/test/render";

const motion = vi.hoisted(() => {
  const complete = () => ({ cancel: vi.fn(), finished: Promise.resolve() });
  return {
    reduced: false,
    ambientCancel: vi.fn(),
    startQuoteAmbient: vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => undefined) })),
    animateQuoteExit: vi.fn(complete),
    animateQuoteEnter: vi.fn(complete),
    animateRefreshIcon: vi.fn(complete),
  };
});

vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => motion.reduced }));
vi.mock("@/lib/motion/productMotion", () => ({
  startQuoteAmbient: motion.startQuoteAmbient,
  animateQuoteExit: motion.animateQuoteExit,
  animateQuoteEnter: motion.animateQuoteEnter,
  animateRefreshIcon: motion.animateRefreshIcon,
}));

describe("InspirationStrip", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    motion.reduced = false;
    motion.startQuoteAmbient.mockImplementation(() => ({ cancel: motion.ambientCancel, finished: new Promise(() => undefined) }));
    motion.animateQuoteExit.mockImplementation(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
  });

  it("starts ambient motion for the session quote", async () => {
    const selected = INSPIRATION_QUOTES[1];
    window.sessionStorage.setItem(INSPIRATION_QUOTE_KEY, selected.id);
    render(<InspirationStrip />);

    await waitFor(() => expect(screen.getByText(selected.text, { exact: false })).toBeDefined());
    expect(motion.startQuoteAmbient).toHaveBeenCalled();
  });

  it("exits, replaces, persists, and enters when another thought is requested", async () => {
    const user = userEvent.setup();
    const current = INSPIRATION_QUOTES[0];
    const next = INSPIRATION_QUOTES[1];
    window.sessionStorage.setItem(INSPIRATION_QUOTE_KEY, current.id);
    render(<InspirationStrip />);
    await waitFor(() => expect(screen.getByText(current.text, { exact: false })).toBeDefined());
    motion.animateQuoteExit.mockClear();

    await user.click(screen.getByRole("button", { name: "Show another thought" }));

    expect(motion.animateQuoteExit).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText(next.text, { exact: false })).toBeDefined());
    expect(window.sessionStorage.getItem(INSPIRATION_QUOTE_KEY)).toBe(next.id);
    expect(motion.animateQuoteEnter).toHaveBeenCalled();
    expect(motion.animateRefreshIcon).toHaveBeenCalledOnce();
  });

  it("ignores rapid duplicate requests and cancels ambient motion on cleanup", async () => {
    let finishExit: () => void = () => undefined;
    motion.animateQuoteExit.mockImplementationOnce(() => ({
      cancel: vi.fn(),
      finished: new Promise<void>((resolve) => { finishExit = resolve; }),
    }));
    const { unmount } = render(<InspirationStrip />);
    const button = screen.getByRole("button", { name: "Show another thought" });

    button.click();
    button.click();
    expect(motion.animateQuoteExit).toHaveBeenCalledOnce();
    finishExit();
    await waitFor(() => expect(motion.animateQuoteEnter).toHaveBeenCalled());
    unmount();
    expect(motion.ambientCancel).toHaveBeenCalled();
  });

  it("changes immediately without motion when reduced motion is active", async () => {
    motion.reduced = true;
    const user = userEvent.setup();
    window.sessionStorage.setItem(INSPIRATION_QUOTE_KEY, INSPIRATION_QUOTES[0].id);
    render(<InspirationStrip />);
    await waitFor(() => expect(screen.getByText(INSPIRATION_QUOTES[0].text, { exact: false })).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Show another thought" }));

    expect(screen.getByText(INSPIRATION_QUOTES[1].text, { exact: false })).toBeDefined();
    expect(motion.startQuoteAmbient).not.toHaveBeenCalled();
    expect(motion.animateQuoteExit).not.toHaveBeenCalled();
  });
});
