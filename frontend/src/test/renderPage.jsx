import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import MockAdapter from "axios-mock-adapter";
import axios from "axios";

import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import { CurrencyProvider } from "../context/CurrencyContext";
import API, { identityApi } from "../services/api";

// Shared render helper for page-level smoke tests. Wraps a page in the same
// provider stack main.jsx uses in production, with a router and lenient
// axios mocks so any on-mount fetch resolves instead of hanging or throwing.
export function renderPage(ui, { route = "/", authed = false, admin = false } = {}) {
  if (authed) {
    localStorage.setItem("token", "test-token");
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 1, email: "test@example.com", role: admin ? "ADMIN" : "USER" })
    );
  }

  const apiMock = new MockAdapter(API);
  const idMock = new MockAdapter(identityApi);
  const axiosMock = new MockAdapter(axios);
  // Empty-array default satisfies typical `.map`/`.filter`/`.reduce` usage on
  // GET responses; individual tests can add more specific mocks before this call.
  apiMock.onAny().reply(200, []);
  idMock.onAny().reply(200, []);
  axiosMock.onAny().reply(200, []);

  const utils = render(
    <GoogleOAuthProvider clientId="test-client-id">
      <AuthProvider>
        <ThemeProvider>
          <CurrencyProvider>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </CurrencyProvider>
        </ThemeProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );

  return { ...utils, apiMock, idMock, axiosMock };
}
