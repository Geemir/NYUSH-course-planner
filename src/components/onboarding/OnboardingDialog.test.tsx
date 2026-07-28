// @vitest-environment jsdom
import { useRef, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { renderWithProviders, screen, waitFor } from "@/test/render";

function GuideHarness({ onComplete = () => undefined }) {
  const [open, setOpen] = useState(false);
  const guideRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={guideRef} onClick={() => setOpen(true)}>
        Guide
      </button>
      <OnboardingDialog
        open={open}
        onOpenChange={setOpen}
        onComplete={() => {
          onComplete();
          setOpen(false);
        }}
        returnFocusRef={guideRef}
      />
    </>
  );
}

function mediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

describe("OnboardingDialog", () => {
  let animate: ReturnType<typeof vi.fn>;
  let originalAnimate: PropertyDescriptor | undefined;
  let originalMatchMedia: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalAnimate = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "animate",
    );
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mediaQueryList(false)),
    });
  });

  afterEach(() => {
    if (originalAnimate) {
      Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      delete (window as Partial<Window>).matchMedia;
    }
  });

  it("animates Next and Back in their spatial direction", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GuideHarness />);

    await user.click(screen.getByRole("button", { name: "Guide" }));
    await waitFor(() => expect(animate).toHaveBeenCalled());
    animate.mockClear();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(animate).toHaveBeenCalled());
    expect(animate.mock.calls.at(-1)?.[0]?.[0]).toEqual({
      opacity: 0,
      transform: "translate3d(12px, 0, 0)",
    });
    animate.mockClear();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(animate).toHaveBeenCalled());
    expect(animate.mock.calls.at(-1)?.[0]?.[0]).toEqual({
      opacity: 0,
      transform: "translate3d(-12px, 0, 0)",
    });
  });

  it("changes steps without animation when reduced motion is requested", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mediaQueryList(true)),
    });
    const user = userEvent.setup();
    renderWithProviders(<GuideHarness />);

    await user.click(screen.getByRole("button", { name: "Guide" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Find courses")).toBeDefined();
    expect(animate).not.toHaveBeenCalled();
  });

  it("moves through the four approved guide steps and supports Back", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GuideHarness />);

    await user.click(screen.getByRole("button", { name: "Guide" }));
    expect(screen.getByText("Step 1 of 4")).toBeDefined();
    expect(screen.getByText("Choose your program")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Find courses")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Build your timeline")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Find courses")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Read your progress")).toBeDefined();
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined();
  });

  it("completes the guide when Skip is chosen", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWithProviders(<GuideHarness onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "Guide" }));
    await user.click(screen.getByRole("button", { name: "Skip guide" }));

    expect(onComplete).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByText("Choose your program")).toBeNull();
    });
  });

  it("completes on Done and restores focus to the Guide trigger", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWithProviders(<GuideHarness onComplete={onComplete} />);
    const guide = screen.getByRole("button", { name: "Guide" });

    await user.click(guide);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onComplete).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(guide));
  });
});
