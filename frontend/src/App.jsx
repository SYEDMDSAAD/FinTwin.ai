import {

    BrowserRouter,

    Routes,

    Route,

    Navigate

} from "react-router-dom";

import Dashboard from "./pages/Dashboard";

import Login from "./pages/Login";

import Register from "./pages/Register";

import ProtectedRoute from "./components/ProtectedRoute";

import AdminRoute from "./components/AdminRoute";

import AdminPage from "./pages/AdminPage";

import Profile from "./pages/Profile";

import OnboardingPage from "./pages/OnboardingPage";

import BankConnectedPage from "./pages/BankConnectedPage";

import LandingPage from "./pages/LandingPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {

    return (

        <BrowserRouter>

            <Routes>

                {/* =========================
                    LANDING  (default root — always shown first)
                ========================= */}

                <Route path="/"        element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
                <Route path="/landing" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />

                {/* =========================
                    AUTH
                ========================= */}

                <Route
                    path="/login"
                    element={<ErrorBoundary><Login /></ErrorBoundary>}
                />

                <Route
                    path="/register"
                    element={<ErrorBoundary><Register /></ErrorBoundary>}
                />

                <Route path="/reset-password" element={<ErrorBoundary><ResetPasswordPage /></ErrorBoundary>} />
                <Route path="/privacy-policy" element={<ErrorBoundary><PrivacyPolicyPage /></ErrorBoundary>} />
                <Route path="/terms"          element={<ErrorBoundary><TermsOfServicePage /></ErrorBoundary>} />

                {/* =========================
                    DASHBOARD
                ========================= */}

                <Route
                    path="/dashboard"
                    element={
                        <ErrorBoundary>
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        </ErrorBoundary>
                    }
                />

                {/* =========================
                    FALLBACK
                ========================= */}

                <Route
                    path="*"
                    element={<Navigate to="/" />}
                />

                {/* =========================
                    PROFILE
                ========================= */}

                <Route
                    path="/profile"
                    element={
                        <ErrorBoundary>
                            <ProtectedRoute>
                                <Profile />
                            </ProtectedRoute>
                        </ErrorBoundary>
                    }
                />

                {/* =========================
                    ONBOARDING
                ========================= */}

                <Route
                    path="/onboarding"
                    element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>}
                />

                {/* Setu AA redirects here after consent */}
                <Route
                    path="/bank-connected"
                    element={<ErrorBoundary><BankConnectedPage /></ErrorBoundary>}
                />

                {/* =========================
                    ADMIN
                ========================= */}

                <Route
                    path="/admin"
                    element={
                        <ErrorBoundary>
                            <AdminRoute>
                                <AdminPage />
                            </AdminRoute>
                        </ErrorBoundary>
                    }
                />

            </Routes>

        </BrowserRouter>

    );
}

export default App;