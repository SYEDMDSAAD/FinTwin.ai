import React from "react";

import ReactDOM from "react-dom/client";

import App from "./App.jsx";

import "./index.css";

import { Toaster } from "react-hot-toast";

import { AuthProvider }
    from "./context/AuthContext";

import { ThemeProvider, useTheme }
    from "./context/ThemeContext";

import { CurrencyProvider }
    from "./context/CurrencyContext";

import {
    GoogleOAuthProvider
} from "@react-oauth/google";

function ThemedToaster() {
    const { isDark } = useTheme();

    const bg      = isDark ? "#18181b" : "#ffffff";
    const text    = isDark ? "#f1f5f9" : "#111827";
    const border  = isDark ? "#3f3f46" : "#e2e8f0";
    const iconBg  = isDark ? "#fff"    : "#fff";

    return (
        <Toaster
            position="top-right"
            reverseOrder={false}
            toastOptions={{
                style: {
                    background: bg,
                    color: text,
                    border: `1px solid ${border}`,
                    borderRadius: "16px",
                    padding: "16px",
                    boxShadow: isDark
                        ? "0 8px 32px rgba(0,0,0,0.4)"
                        : "0 4px 24px rgba(0,0,0,0.10)",
                },
                success: {
                    iconTheme: { primary: "#22c55e", secondary: iconBg },
                },
                error: {
                    iconTheme: { primary: "#ef4444", secondary: iconBg },
                },
            }}
        />
    );
}

ReactDOM.createRoot(
    document.getElementById("root")
).render(

    <React.StrictMode>

        <GoogleOAuthProvider

            clientId={
                import.meta.env
                    .VITE_GOOGLE_CLIENT_ID
            }

        >

            <AuthProvider>
            <ThemeProvider>
            <CurrencyProvider>

                <ThemedToaster />

                <App />

            </CurrencyProvider>
            </ThemeProvider>
            </AuthProvider>

        </GoogleOAuthProvider>

    </React.StrictMode>
);