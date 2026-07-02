import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import ResetPasswordPage from "./ResetPasswordPage";

describe("ResetPasswordPage", () => {
  it("renders the reset form without crashing", () => {
    renderPage(<ResetPasswordPage />, { route: "/reset-password?token=abc" });
    expect(screen.getByText("Set new password")).toBeInTheDocument();
  });
});
