import axios from "axios";

// ── Main backend — business data (transactions, dashboard, AI, etc.) ──────────
const API = axios.create({
    baseURL: "/api/v1"
});

// ── Identity service — auth, 2FA, tokens ─────────────────────────────────────
export const identityApi = axios.create({
    baseURL: "/api"
});

// ── Attach access token to every request ─────────────────────────────────────

function attachToken(config) {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
}

API.interceptors.request.use(attachToken, (err) => Promise.reject(err));
identityApi.interceptors.request.use(attachToken, (err) => Promise.reject(err));

// ── Auto-refresh on 401 (shared by BOTH clients) ─────────────────────────────
// The refresh state is global so a token expiry that surfaces as several
// concurrent 401s (e.g. the dashboard's parallel fetches) triggers exactly
// one refresh call; every other failed request queues and retries with the
// new token. Previously only the identity client refreshed — since almost
// all traffic goes to the main backend, sessions hard-ended at access-token
// expiry with a redirect to /login.

let isRefreshing = false;
let refreshQueue = [];

function drainQueue(newToken, error) {
    refreshQueue.forEach(({ resolve, reject }) =>
        error ? reject(error) : resolve(newToken)
    );
    refreshQueue = [];
}

function registerRefreshInterceptor(client) {
    client.interceptors.response.use(
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
                    return client(originalRequest);
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
                const { data } = await axios.post("/api/auth/refresh", {
                    refreshToken,
                });
                localStorage.setItem("token", data.accessToken);
                localStorage.setItem("refreshToken", data.refreshToken);
                drainQueue(data.accessToken, null);
                originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
                return client(originalRequest);
            } catch (refreshError) {
                drainQueue(null, refreshError);
                clearAuthAndRedirect();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
    );
}

registerRefreshInterceptor(identityApi);
registerRefreshInterceptor(API);

function clearAuthAndRedirect() {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/login";
}

export default API;
