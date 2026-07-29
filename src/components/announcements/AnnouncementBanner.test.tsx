// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import { render, screen, waitFor } from "@/test/render";

const motion = vi.hoisted(() => ({
  reduced: false,
  enter: vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() })),
  exit: vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() })),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => motion.reduced }));
vi.mock("@/lib/motion/productMotion", () => ({
  animateAnnouncementEnter: motion.enter,
  animateAnnouncementExit: motion.exit,
}));

const announcement = {
  id: "notice-1", title: "Advising week", body: "Review your plan.", tone: "warning",
  linkUrl: "https://www.nyu.edu/advising", linkLabel: "Advising details",
  publishedAt: "2026-07-29T00:00:00.000Z", expiresAt: null,
};

describe("AnnouncementBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    motion.reduced = false;
    motion.enter.mockImplementation(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
    motion.exit.mockImplementation(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ announcement })));
  });

  it("shows safe public content, tone text, and an external link", async () => {
    render(<AnnouncementBanner />);
    expect(await screen.findByText("Advising week")).toBeDefined();
    expect(screen.getByText("Warning")).toBeDefined();
    const link = screen.getByRole("link", { name: "Advising details" });
    expect(link.getAttribute("href")).toBe(announcement.linkUrl);
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(motion.enter).toHaveBeenCalled();
  });

  it("waits for exit before hiding and stores dismissal by id", async () => {
    let finish: () => void = () => undefined;
    motion.exit.mockImplementationOnce(() => ({ cancel: vi.fn(), finished: new Promise<void>((resolve) => { finish = resolve; }) }));
    const user = userEvent.setup();
    render(<AnnouncementBanner />);
    await screen.findByText("Advising week");

    await user.click(screen.getByRole("button", { name: "Dismiss announcement" }));
    expect(screen.getByText("Advising week")).toBeDefined();
    finish();
    await waitFor(() => expect(screen.queryByText("Advising week")).toBeNull());
    expect(window.localStorage.getItem("nyush-planner:announcement-dismissed:notice-1")).toBe("true");
  });

  it("suppresses the same id but allows a newly published id", async () => {
    window.localStorage.setItem("nyush-planner:announcement-dismissed:notice-1", "true");
    const { unmount } = render(<AnnouncementBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText("Advising week")).toBeNull();
    unmount();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ announcement: { ...announcement, id: "notice-2" } })));
    render(<AnnouncementBanner />);
    expect(await screen.findByText("Advising week")).toBeDefined();
  });

  it("fails silently when the public request is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AnnouncementBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Planner announcement" })).toBeNull();
  });
});
