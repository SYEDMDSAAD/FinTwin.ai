import { useEffect, useState } from "react";
import { isNativeApp } from "../native";

const QUERY = "(min-width: 1024px)";

const matches = () => {
    if (isNativeApp()) return false;            // the Android app keeps its phone layout
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
};

/**
 * True on a computer-sized screen in a browser. Pages use it to choose a
 * desktop layout; the phone layout (and the Android app) never changes.
 */
export default function useWide() {
    const [wide, setWide] = useState(matches);
    useEffect(() => {
        if (isNativeApp() || !window.matchMedia) return undefined;
        const mq = window.matchMedia(QUERY);
        const on = () => setWide(mq.matches);
        mq.addEventListener?.("change", on);
        return () => mq.removeEventListener?.("change", on);
    }, []);
    return wide;
}
