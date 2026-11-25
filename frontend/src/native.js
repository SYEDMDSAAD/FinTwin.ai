import { Capacitor } from "@capacitor/core";

/* Only does anything inside the Android app. */
export function installNativeHandlers() {
    if (!Capacitor.isNativePlatform()) return;
    // Android back button: go back a screen, or leave the app from the first one
    import("@capacitor/app").then(({ App }) => {
        App.addListener("backButton", ({ canGoBack }) => {
            if (canGoBack) window.history.back();
            else App.exitApp();
        });
    });
}

export const isNativeApp = () => Capacitor.isNativePlatform();

let googleReady = null;

/* Google sign-in inside the Android app. Google blocks its web sign-in in
   app WebViews, so the app uses the phone's own Google account picker. The
   ID token is issued for the same web client ID, so the backend's
   /auth/google accepts it unchanged. Resolves to the ID token, or null
   when the person closes the picker. */
export async function nativeGoogleIdToken() {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    if (!googleReady) {
        googleReady = SocialLogin.initialize({
            google: {
                webClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
                mode: "online",
                skipAuthOnlyAuthorizationAfterSignIn: true,
            },
        }).catch((e) => { googleReady = null; throw e; });
    }
    await googleReady;
    try {
        const res = await SocialLogin.login({ provider: "google", options: {} });
        return res?.result?.idToken || null;
    } catch (e) {
        if (/cancel/i.test(String(e?.message || e))) return null;
        throw e;
    }
}
