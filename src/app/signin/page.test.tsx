// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import SignInPage from "./page";

const { getProviders, signIn } = vi.hoisted(() => ({
  getProviders: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ getProviders, signIn }));

describe("SignInPage", () => {
  beforeEach(() => {
    getProviders.mockReset();
    signIn.mockReset();
  });

  it("offers Google while marking email sign-in as unavailable", async () => {
    getProviders.mockResolvedValue({
      google: { id: "google", name: "Google", type: "oidc" },
    });

    render(<SignInPage />);

    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(screen.getByText("Email sign-in - In development")).toBeDefined();
    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
  });

  it("shows a bounded loading state before providers resolve", () => {
    getProviders.mockReturnValue(new Promise(() => undefined));

    render(<SignInPage />);

    expect((screen.getByRole("button", { name: "Loading Google sign-in" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Email sign-in - In development")).toBeDefined();
  });

  it("dispatches Google sign-in with the planner callback", async () => {
    const user = userEvent.setup();
    getProviders.mockResolvedValue({
      google: { id: "google", name: "Google", type: "oidc" },
    });

    render(<SignInPage />);
    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });

  it("explains when Google is not configured without adding another sign-in action", async () => {
    getProviders.mockResolvedValue(null);

    render(<SignInPage />);

    expect(await screen.findByText("Google sign-in is temporarily unavailable.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Email sign-in - In development" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not update state after unmounting during provider discovery", async () => {
    let resolveProviders: (value: null) => void = () => undefined;
    getProviders.mockReturnValue(new Promise<null>((resolve) => { resolveProviders = resolve; }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = render(<SignInPage />);

    unmount();
    resolveProviders(null);
    await waitFor(() => expect(getProviders).toHaveBeenCalledOnce());

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
