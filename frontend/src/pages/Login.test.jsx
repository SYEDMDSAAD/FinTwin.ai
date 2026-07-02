import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Login from "./Login";

describe("Login", () => {
  it("renders the sign-in form without crashing", () => {
    renderPage(<Login />, { route: "/login" });
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });
});
