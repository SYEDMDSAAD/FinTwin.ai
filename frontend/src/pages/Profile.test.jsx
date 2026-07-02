import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Profile from "./Profile";

describe("Profile", () => {
  it("renders without crashing for an authenticated user", async () => {
    renderPage(<Profile />, { route: "/profile", authed: true });
    expect(await screen.findByText("My Profile")).toBeInTheDocument();
  });
});
