import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { renderPage } from "../test/renderPage";
import Login from "./Login";

function renderLoginFlow() {
  return renderPage(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<div>ADMIN PANEL</div>} />
      <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      <Route path="/onboarding" element={<div>ONBOARDING</div>} />
    </Routes>,
    { route: "/login" }
  );
}

async function signIn(role, idMock) {
  idMock.reset();
  idMock.onPost("/auth/login").reply(200, {
    accessToken: "tok", refreshToken: "ref", email: "x@example.com", fullName: "X", role,
  });
  idMock.onGet("/auth/me").reply(200, { onboardingCompleted: true });
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("you@example.com"), "x@example.com");
  await user.type(screen.getByPlaceholderText("••••••••"), "Password123!");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("Login", () => {
  it("renders the sign-in form without crashing", () => {
    renderPage(<Login />, { route: "/login" });
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("sends an admin to the admin panel, not the dashboard", async () => {
    const { idMock } = renderLoginFlow();
    await signIn("ADMIN", idMock);
    expect(await screen.findByText("ADMIN PANEL")).toBeInTheDocument();
  });

  it("sends a user to the dashboard", async () => {
    const { idMock } = renderLoginFlow();
    await signIn("USER", idMock);
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
  });
});
