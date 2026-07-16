// @vitest-environment jsdom
import { useRef, useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

describe("OnboardingDialog", () => {
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
