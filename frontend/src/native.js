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
