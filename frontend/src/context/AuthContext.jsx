import {
    createContext,
    useContext,
    useState
} from "react";

const AuthContext =
    createContext();

export const AuthProvider = ({
    children
}) => {

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

    const login = (

        jwtToken,

        userData

    ) => {

        localStorage.setItem(
            "token",
            jwtToken
        );

        localStorage.setItem(

            "user",

            JSON.stringify(
                userData
            )
        );

        setToken(jwtToken);

        setUser(userData);
    };

    const logout = () => {

        localStorage.removeItem(
            "token"
        );

        localStorage.removeItem(
            "user"
        );

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

                isAuthenticated: !!token,

                isAdmin: user?.role === "ADMIN"
            }}
        >

            {children}

        </AuthContext.Provider>
    );
};

export const useAuth =
    () =>
        useContext(
            AuthContext
        );