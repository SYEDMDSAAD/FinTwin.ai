import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import OnboardingPage from "./OnboardingPage";

describe("OnboardingPage", () => {
  beforeEach(() => sessionStorage.clear());

  it("renders the first step without crashing", () => {
    renderPage(<OnboardingPage />, { route: "/onboarding", authed: true });
    expect(screen.getByText("Secure your financial twin")).toBeInTheDocument();
  });
});
