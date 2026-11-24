import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Card, Button, Badge, SectionHeader, Stat, EmptyState } from ".";

describe("UI kit", () => {
    it("Card is a section, or a button when it can be clicked", () => {
        const { rerender } = render(<Card aria-label="Plain">x</Card>);
        expect(screen.getByLabelText("Plain").tagName).toBe("SECTION");
        const onClick = vi.fn();
        rerender(<Card onClick={onClick}>Open</Card>);
        fireEvent.click(screen.getByRole("button", { name: "Open" }));
        expect(onClick).toHaveBeenCalled();
    });

    it("Button never uses text-white, which the light theme repaints", () => {
        render(<Button>Pay</Button>);
        const b = screen.getByRole("button", { name: "Pay" });
        expect(b.className).not.toMatch(/text-white/);
        expect(b.className).toMatch(/text-accent-on/);
        expect(b).toHaveAttribute("type", "button");
    });

    it("SectionHeader is an h2 with its action", () => {
        render(<SectionHeader title="Budgets" action={<Button size="sm">Add</Button>} />);
        expect(screen.getByRole("heading", { level: 2, name: "Budgets" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    it("Stat, Badge and EmptyState show their text", () => {
        render(<>
            <Stat label="Left" value="₹4,275" note="7 days" tone="bad" />
            <Badge tone="warn">Near limit</Badge>
            <EmptyState title="No goals yet" body="Set one" />
        </>);
        expect(screen.getByText("₹4,275").className).toMatch(/text-bad/);
        expect(screen.getByText("Near limit").className).toMatch(/text-warn/);
        expect(screen.getByText("No goals yet")).toBeInTheDocument();
    });
});
