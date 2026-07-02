import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Register from "./Register";

describe("Register", () => {
  it("renders the sign-up form without crashing", () => {
    renderPage(<Register />, { route: "/register" });
    expect(screen.getByText("Create account")).toBeInTheDocument();
  });
});
