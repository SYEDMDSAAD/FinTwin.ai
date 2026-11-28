/**
 * Open a new view at its top. The dashboard scrolls inside an element, not
 * the window: <main> on a computer, a flex-1 div in the phone layout. Each
 * scrolled element up the page is reset, and the window too.
 */
export function scrollPageTop(from) {
    try {
        const all = [...document.querySelectorAll("main, div")].filter((el) => el.scrollTop > 0);
        for (const el of all) {
            if (!from || el.contains(from)) el.scrollTo?.({ top: 0 }) ?? (el.scrollTop = 0);
        }
        window.scrollTo?.(0, 0);
    } catch { /* no layout in tests */ }
}
