/* Where the API lives.

   On the web the app and the API share one origin, so paths like /api/v1
   are enough. The Android app is served from inside the phone
   (https://localhost), so its build sets VITE_API_ORIGIN to the web
   server, which forwards /api to the backend and identity services. */

export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || "").replace(/\/+$/, "");

export function apiUrl(path) {
    return API_ORIGIN + path;
}
