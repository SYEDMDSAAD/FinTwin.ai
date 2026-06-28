import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from "react-router-dom";
import { lazy, Suspense } from "react";

// Small, used-everywhere wrappers stay eager.
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import ErrorBoundary from "./components/ErrorBoundary";

// Pages are code-split so the initial bundle only loads what the first route needs
// (heavy deps like recharts/jspdf/framer-motion then load on demand, not up front).
const Dashboard         = lazy(() => import("./pages/Dashboard"));
const Login             = lazy(() => import("./pages/Login"));
const Register          = lazy(() => import("./pages/Register"));
const AdminPage         = lazy(() => import("./pages/AdminPage"));
const Profile           = lazy(() => import("./pages/Profile"));
const OnboardingPage    = lazy(() => import("./pages/OnboardingPage"));
const BankConnectedPage = lazy(() => import("./pages/BankConnectedPage"));
const LandingPage       = lazy(() => import("./pages/LandingPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfServicePage"));


function RouteFallback() {
    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#94a3b8",
            fontFamily: "system-ui, sans-serif",
        }}>
            Loading…
        </div>
    );
}


function App() {
    return (
        <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
                <Routes>
                    {/* LANDING (default root) */}
                    <Route path="/"        element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
                    <Route path="/landing" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />

                    {/* AUTH */}
                    <Route path="/login"    element={<ErrorBoundary><Login /></ErrorBoundary>} />
                    <Route path="/register" element={<ErrorBoundary><Register /></ErrorBoundary>} />
                    <Route path="/reset-password" element={<ErrorBoundary><ResetPasswordPage /></ErrorBoundary>} />
                    <Route path="/privacy-policy" element={<ErrorBoundary><PrivacyPolicyPage /></ErrorBoundary>} />
                    <Route path="/terms"          element={<ErrorBoundary><TermsOfServicePage /></ErrorBoundary>} />

                    {/* DASHBOARD */}
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

                    {/* PROFILE */}
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

                    {/* ONBOARDING */}
                    <Route path="/onboarding" element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />

                    {/* Setu AA redirects here after consent */}
                    <Route path="/bank-connected" element={<ErrorBoundary><BankConnectedPage /></ErrorBoundary>} />

                    {/* ADMIN */}
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

                    {/* FALLBACK */}
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    );
}

export default App;
