import { createContext, useContext, useState } from "react";
import { identityApi } from "../services/api";

const AuthContext = createContext();

// Tolerate corrupt/legacy values in localStorage — a bad JSON blob must never
// crash the whole app at startup (white screen).
const safeParse = (raw) => {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

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
            return safeParse(imp);
        }
        return safeParse(localStorage.getItem("user"));
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

    // After the user edits their profile: everything showing the user (the
    // header's name, the help widget) reads this, so it updates at once
    const updateUser = (changes) => {
        setUser((prev) => {
            const next = { ...(prev || {}), ...changes };
            localStorage.setItem("user", JSON.stringify(next));
            return next;
        });
    };

    // Calls identity service to revoke refresh token, then clears local state
    const logout = async () => {
        const refreshToken = localStorage.getItem("refreshToken");
        // The demo account is shared: logging it out on the server would sign
        // out every other visitor, so a demo session just ends here
        if (refreshToken && user?.role !== "DEMO") {
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
                updateUser,
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

// The signed-in user for display. Outside an AuthProvider (a component
// rendered on its own, as in tests) it falls back to what login stored.
export const useCurrentUser = () => {
    const auth = useContext(AuthContext);
    return (auth ? auth.user : safeParse(localStorage.getItem("user"))) || {};
};
