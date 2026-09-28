import { Navigate } from "react-router-dom";

// Personal-finance pages. An admin account has none of the permissions these
// pages call for (the ADMIN role is a separate trust domain on the backend),
// so it is sent to the admin panel instead of a page of 403s.
function storedRole() {
    try {
        return JSON.parse(localStorage.getItem("user") || "{}").role;
    } catch {
        return undefined;
    }
}

const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem("token");

    if (!token) {
        return <Navigate to="/login" />;
    }
    if (storedRole() === "ADMIN") {
        return <Navigate to="/admin" replace />;
    }

    return children;
};

export default ProtectedRoute;
