import axios from "axios";

const API = axios.create({

    baseURL: "http://localhost:8080/api"

});

// =====================================
// JWT INTERCEPTOR
// =====================================

API.interceptors.request.use(

    (config) => {

        const token =
            localStorage.getItem(
                "token"
            );

        if (token) {

            config.headers.Authorization =
                `Bearer ${token}`;
        }

        return config;
    },

    (error) => {

        return Promise.reject(
            error
        );
    }

);

// =====================================
// AUTO LOGOUT ON 401
// =====================================

API.interceptors.response.use(

    response => response,

    error => {

        // Only auto-logout on 401 for authenticated requests (not auth endpoints themselves)
        if (
            error.response?.status === 401 &&
            !error.config?.url?.includes("/auth/")
        ) {

            localStorage.removeItem(
                "token"
            );

            window.location.href =
                "/login";
        }

        return Promise.reject(
            error
        );
    }
);

export default API;