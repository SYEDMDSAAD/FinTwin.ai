import { createContext, useContext, useState } from "react";
import { identityApi } from "../services/api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {

    // Support admin impersonation: _imp_token is set by AdminPage, consumed once
    const resolveToken = () => {
        const imp = localStorage.getItem("_imp_token");
        if (imp) {
            localStorage.setItem("token", imp);
            localStorage.removeItem("_imp_token");
            return imp;
        }
        return localStorage.getItem("token");
    };

    const resolveUser = () => {
        const imp = localStorage.getItem("_imp_user");
        if (imp) {
            localStorage.setItem("user", imp);
            localStorage.removeItem("_imp_user");
            return JSON.parse(imp);
        }
        return JSON.parse(localStorage.getItem("user"));
    };

    const [token, setToken] = useState(resolveToken);
    const [user, setUser]   = useState(resolveUser);

    // Called after successful login — stores access token, refresh token, and user info
    const login = (accessToken, userData, refreshToken) => {
        localStorage.setItem("token", accessToken);
        localStorage.setItem("user", JSON.stringify(userData));
        if (refreshToken) {
            localStorage.setItem("refreshToken", refreshToken);
        }
        setToken(accessToken);
        setUser(userData);
    };

    // Calls identity service to revoke refresh token, then clears local state
    const logout = async () => {
        const refreshToken = localStorage.getItem("refreshToken");
        if (refreshToken) {
            try {
                await identityApi.post("/auth/logout", { refreshToken });
            } catch {
                // Best-effort — clear local state regardless
            }
        }
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
    };

    // Synchronous logout for cases where async isn't possible (e.g., interceptor)
    const logoutSync = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                token,
                user,
                login,
                logout,
                logoutSync,
                isAuthenticated: !!token,
                isAdmin: user?.role === "ADMIN"
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
