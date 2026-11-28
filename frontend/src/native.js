import { Capacitor } from "@capacitor/core";

/* Only does anything inside the phone apps (Android and iPhone). */
export function installNativeHandlers() {
    if (!Capacitor.isNativePlatform()) return;
    // iPhone: the web view runs under the status bar and notch (see index.css .native-ios)
    if (Capacitor.getPlatform() === "ios") document.documentElement.classList.add("native-ios");
    // Android back button: go back a screen, or leave the app from the first one
    import("@capacitor/app").then(({ App }) => {
        App.addListener("backButton", ({ canGoBack }) => {
            if (canGoBack) window.history.back();
            else App.exitApp();
        });
    });
}

export const isNativeApp = () => Capacitor.isNativePlatform();
export const isIos = () => Capacitor.getPlatform() === "ios";

/* Google sign-in in the phone apps: always on Android; on iPhone only once
   the iOS OAuth client exists (VITE_GOOGLE_IOS_CLIENT_ID), else email only. */
export const nativeGoogleAvailable = () =>
    !isIos() || !!import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;

let googleReady = null;

/* Google sign-in inside the phone apps. Google blocks its web sign-in in
   app WebViews, so the app uses the phone's own Google sign-in. On Android
   the ID token is issued for the web client ID; on iPhone it may carry the
   iOS client ID, which the identity service also accepts
   (GOOGLE_IOS_CLIENT_ID). Resolves to the ID token, or null when the
   person closes the picker. */
export async function nativeGoogleIdToken() {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    if (!googleReady) {
        googleReady = SocialLogin.initialize({
            google: {
                webClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
                ...(isIos() ? {
                    iOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID,
                    iOSServerClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
                } : {}),
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
