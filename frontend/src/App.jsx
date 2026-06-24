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

function App() {

    return (

        <BrowserRouter>

            <Routes>

                {/* =========================
                    LANDING
                ========================= */}

                <Route
                    path="/landing"
                    element={<LandingPage />}
                />

                {/* =========================
                    AUTH
                ========================= */}

                <Route

                    path="/login"

                    element={<Login />}

                />

                <Route

                    path="/register"

                    element={<Register />}

                />

                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms"          element={<TermsOfServicePage />} />

                {/* =========================
                    DASHBOARD
                ========================= */}

                <Route

                    path="/"

                    element={

                        <ProtectedRoute>

                            <Dashboard />

                        </ProtectedRoute>

                    }

                />

                {/* =========================
                    FALLBACK
                ========================= */}

                <Route

                    path="*"

                    element={

                        <Navigate
                            to="/"
                        />

                    }

                />

                    {/* =========================
                    PROFILE
                ========================= */}

                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute>
                            <Profile />
                        </ProtectedRoute>
                    }
                />

                {/* =========================
                    ONBOARDING
                ========================= */}

                <Route
                    path="/onboarding"
                    element={<OnboardingPage />}
                />

                {/* Setu AA redirects here after consent */}
                <Route
                    path="/bank-connected"
                    element={<BankConnectedPage />}
                />

                {/* =========================
                    ADMIN
                ========================= */}

                <Route
                    path="/admin"
                    element={
                        <AdminRoute>
                            <AdminPage />
                        </AdminRoute>
                    }
                />

            </Routes>

        </BrowserRouter>

    );
}

export default App;