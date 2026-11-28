import { useEffect, useState } from "react";
import { guardEnabled } from "../services/guardApi";

/** True once the backend says Spend Guard is on for this user. False while it checks. */
export function useSpendGuardEnabled() {
    const [enabled, setEnabled] = useState(false);
    useEffect(() => {
        let live = true;
        guardEnabled().then((on) => live && setEnabled(on));
        return () => {
            live = false;
        };
    }, []);
    return enabled;
}
