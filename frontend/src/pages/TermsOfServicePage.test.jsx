import { describe, it, expect } from "vitest";
import { renderPage } from "../test/renderPage";
import TermsOfServicePage from "./TermsOfServicePage";

describe("TermsOfServicePage", () => {
  it("renders without crashing", () => {
    const { container } = renderPage(<TermsOfServicePage />);
    expect(container.textContent.length).toBeGreaterThan(0);
  });
});
