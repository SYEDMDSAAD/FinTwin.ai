import axios from "axios";

// ── Main backend — business data (transactions, dashboard, AI, etc.) ──────────
const API = axios.create({
    baseURL: "http://localhost:8080/api"
});

// ── Identity service — auth, 2FA, tokens ─────────────────────────────────────
export const identityApi = axios.create({
    baseURL: "http://localhost:8090/api"
});

// ── Attach access token to every request ─────────────────────────────────────

function attachToken(config) {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
}

API.interceptors.request.use(attachToken, (err) => Promise.reject(err));
identityApi.interceptors.request.use(attachToken, (err) => Promise.reject(err));

// ── Auto-refresh on 401 (identity service) ───────────────────────────────────

let isRefreshing = false;
let refreshQueue = [];

function drainQueue(newToken, error) {
    refreshQueue.forEach(({ resolve, reject }) =>
        error ? reject(error) : resolve(newToken)
    );
    refreshQueue = [];
}

identityApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Skip refresh on auth endpoints or if already retried
        if (
            error.response?.status !== 401 ||
            originalRequest._retry ||
            originalRequest.url?.includes("/auth/") ||
            originalRequest.url?.includes("/token/")
        ) {
            if (error.response?.status === 401 && !originalRequest.url?.includes("/auth/")) {
                clearAuthAndRedirect();
            }
            return Promise.reject(error);
        }

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                refreshQueue.push({ resolve, reject });
            }).then((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return identityApi(originalRequest);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) {
            isRefreshing = false;
            clearAuthAndRedirect();
            return Promise.reject(error);
        }

        try {
            const { data } = await axios.post("http://localhost:8090/api/auth/refresh", {
                refreshToken,
            });
            localStorage.setItem("token", data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);
            identityApi.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
            drainQueue(data.accessToken, null);
            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
            return identityApi(originalRequest);
        } catch (refreshError) {
            drainQueue(null, refreshError);
            clearAuthAndRedirect();
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

// ── Auto-logout on 401 for main backend ──────────────────────────────────────

API.interceptors.response.use(
    (response) => response,
    (error) => {
        if (
            error.response?.status === 401 &&
            !error.config?.url?.includes("/auth/")
        ) {
            clearAuthAndRedirect();
        }
        return Promise.reject(error);
    }
);

function clearAuthAndRedirect() {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/login";
}

export default API;
