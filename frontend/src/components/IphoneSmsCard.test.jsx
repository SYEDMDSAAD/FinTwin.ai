import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../services/api", () => ({ default: api }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../services/smsSync", () => ({ smsAvailable: () => false }));

import IphoneSmsCard, { shortcutEndpoint } from "./IphoneSmsCard";

describe("IphoneSmsCard", () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem("user", JSON.stringify({ email: "a@example.com", role: "USER" }));
        api.get.mockReset();
        api.post.mockReset();
        api.get.mockResolvedValue({ data: { key: "ft1.7.abc" } });
        api.post.mockResolvedValue({ data: { key: "ft1.7.new" } });
    });

    it("the Shortcut posts to the API on the app's origin", () => {
        expect(shortcutEndpoint("https://fintwin.example")).toBe("https://fintwin.example/api/v1/sms/shortcut");
    });

    it("shows the key only when asked, and can replace it", async () => {
        render(<IphoneSmsCard />);
        expect(api.get).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: /Set it up/ }));
        await userEvent.click(screen.getByRole("button", { name: "Show my key" }));
        expect(await screen.findByText("ft1.7.abc")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "New key" }));
        expect(await screen.findByText("ft1.7.new")).toBeInTheDocument();
        expect(api.post).toHaveBeenCalledWith("/sms/shortcut-key/rotate");
    });
});
