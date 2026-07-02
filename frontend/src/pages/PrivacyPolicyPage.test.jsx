import { describe, it, expect } from "vitest";
import { renderPage } from "../test/renderPage";
import PrivacyPolicyPage from "./PrivacyPolicyPage";

describe("PrivacyPolicyPage", () => {
  it("renders without crashing", () => {
    const { container } = renderPage(<PrivacyPolicyPage />);
    expect(container.textContent.length).toBeGreaterThan(0);
  });
});
