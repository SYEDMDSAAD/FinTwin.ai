# Frontend Review — Fixes & Next Steps (2026-06-28)

Full review of the React/Vite frontend (~23.6k lines, ~80 files) for security,
logic, and maturity. **No critical security issues found** — no `dangerouslySetInnerHTML`/
`eval`/`innerHTML` sinks, no hardcoded secrets (the "secret" hits are the user's own
2FA TOTP shown during setup), env via `import.meta.env`, JWT auto-refresh + 401
handling already implemented. The high-value wins here are **performance (code-splitting)**
and **robustness**.

---

## Fixes applied

| # | File | Issue | Fix | Type |
|---|------|-------|-----|------|
| 1 | `src/App.jsx` | All pages were **eagerly imported** → one ~1.59 MB JS chunk (gzip 418 KB) downloaded on every route, incl. landing/login. | Route-level `React.lazy()` + `<Suspense>`. | 🟢 perf (big) |
| 2 | `vite.config.js` | No chunk splitting — heavy libs (recharts, jspdf, framer-motion) bundled into the single chunk. | `manualChunks` splitting `charts` / `pdf` / `motion` / `react-vendor` / `vendor`. | 🟢 perf |
| 3 | `src/context/AuthContext.jsx` | `JSON.parse(localStorage.getItem("user"))` unguarded — a corrupt/legacy value throws at startup → **white screen**. | `safeParse()` helper (try/catch → null) for user + impersonation user. | 🟠 robustness |
| 4 | `SpendingCoachPage`, `NetWorthPage`, `WeeklyReport` (×2), `SmartNotifications`, `Profile` | 6 debug `console.log(error)` / `.catch(console.log)` left in. | Replaced with contextual `console.error(...)` (proper error-level logging). | 🟡 maturity |

### Measured impact (production build)
Before: a single `index-*.js` of **1,590 KB** (gzip 418 KB) on every page.
After: per-route chunks + shared vendors, e.g.
`charts` 404 KB and `motion` 121 KB now load **only** on the routes that use them
(dashboard/analytics), so first paint on landing/login no longer drags in the whole app.

### Investigated and intentionally NOT changed
- **`cssMinify: false`** — I tried to enable it; it's a **justified workaround**, not laziness.
  This is rolldown-vite, whose only bundled CSS minifier is lightningcss, and lightningcss
  cannot parse the escaped Tailwind arbitrary-value selectors (`.bg-\[#080A0F\]`) hand-written
  in `index.css` ("Unexpected token Hash"). `cssMinify:'esbuild'` also fails (esbuild isn't a
  dependency under rolldown). Reverted to `false` with an explanatory comment. gzip still
  compresses the CSS ~6× (118 KB → 19 KB) on the wire.
- **JWT in `localStorage`** — standard for this app and paired with the backend's force-logout;
  not re-architecting here (see Next Steps).

---

## Verification
- `npm run build` ✅ green; chunking confirmed in the output.
- `npm run lint` is **non-blocking in CI** (`npm run lint || true` in `ci-frontend.yml`).
- The one lint error I introduced (an empty `catch`) was fixed; remaining lint errors in
  touched files are pre-existing (see below).

---

## What to do next (not done in this pass)

### High value
1. **Pre-existing lint debt — 193 errors / 7 warnings.** `npm run lint` currently fails
   (only non-blocking because of `|| true`). Common ones: unused imports (`API` in
   `Register`/`ResetPasswordPage`), `no-useless-escape` on regex, `require` in
   `tailwind.config.js` (`no-undef`), `react-hooks/immutability`, empty blocks. Worth a
   dedicated cleanup pass, then drop the `|| true` so lint actually gates.
2. **No frontend tests at all.** Add Vitest + React Testing Library: AuthContext
   (login/logout/safeParse), the api.js refresh/queue interceptor, ProtectedRoute/AdminRoute
   redirects, and a render smoke test per page. This is the biggest coverage gap.
3. **CSS minification** — migrate the escaped `.bg-\[#hex\]` theme selectors in `index.css`
   to CSS variables / `[data-theme]` rules (or add `esbuild` as a dev dep) so lightningcss
   can minify, then enable `cssMinify`.

### Medium
4. **Unify auth checks** — `ProtectedRoute` reads `localStorage` directly while `AdminRoute`
   uses `useAuth()`; route through `useAuth()` consistently.
5. **`MutualFundsTab`** calls `api.mfapi.in` directly from the browser; the backend already
   has a price service — consider proxying through it for consistency/caching/CORS safety.
6. **Token storage** — if the threat model warrants it, move to httpOnly refresh cookies
   (needs backend support) to reduce XSS token-theft exposure. Architectural; weigh later.
7. **`main.jsx`** — guard `VITE_GOOGLE_CLIENT_ID` (Google login silently breaks if unset).

### Low
8. Add a `chunkSizeWarningLimit` or further split `Dashboard` (362 KB) / `react-vendor`.
9. Accessibility pass (aria labels, focus management on modals).
10. Consider a `<Suspense>` skeleton per route instead of the single "Loading…" fallback.
