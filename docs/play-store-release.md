# Play Store release

What's ready in the repo, what only you can do, and the answers Play Console asks for.

## Ready in the repo

- App id `ai.fintwin.app`, version `0.2.0` (versionCode 2), target SDK 36.
- Launcher icon (adaptive, purple "F") and splash screen.
- Release signing wired in `frontend/android/app/build.gradle`. It reads `frontend/android/keystore.properties`, which git ignores, as it does `*.jks` and `*.keystore`.
- `npm run aab` (in `frontend/`) builds the release bundle Play wants. Output: `frontend/android/app/build/outputs/bundle/release/app-release.aab`.
- Store graphics in `docs/play-store/`:
  - `icon-512.png` (512×512 icon);
  - `feature-graphic-1024x500.png`.
- The privacy policy covers SMS, microphone and camera (section 3a): https://fintwin-web-171222129367.asia-south1.run.app/privacy-policy

## Only you can do these

1. **Create the upload key.** You pick the passwords, and nobody else should see them. Run in a terminal:
   ```
   mkdir -p ~/.config/fintwin
   keytool -genkeypair -v -keystore ~/.config/fintwin/fintwin-upload.jks -alias fintwin-upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
   Then copy `frontend/android/keystore.properties.example` to `frontend/android/keystore.properties` and fill in the path and passwords.
   - **Back up the .jks file and its password somewhere safe** (a password manager).
   - With Play App Signing, a lost upload key can be reset through Play support, but it's slow.
2. **Build:** `cd frontend && npm run aab`.
3. **Create the Play Console account** (one-time US$25) and the app.
4. **Closed testing first.** New personal developer accounts must run a closed test with at least 12 testers for 14 days in a row before production access. Check the current numbers in Play Console, since Google changes them. The beta users are a natural fit.
5. **Upload the .aab**, fill in the sections below, and send for review.

## Store listing

**App name:** FinTwin

**Short description** (80 characters max):
> Pause before you pay. Track spending, see your investments, reach your goals.

**Full description:**
> FinTwin puts your spending and your investments in one place, and helps you keep money for what matters.
>
> **Pause before you pay.** Spend Guard checks a UPI payment against your budget, your week and your goals before the money leaves. Groceries and bills go straight through; the spends you'd regret get a moment's thought. FinTwin never holds or moves your money.
>
> **See your investments clearly.** Mutual funds, stocks, FDs, PPF and more, with returns worked out the way your money actually went in (XIRR), past performance next to the index, sector mix and concentration warnings.
>
> **Pause → Invest.** See what the money you didn't spend could become, at clearly stated assumed returns.
>
> **Your money, sorted.** Import a bank statement or let the app read bank SMS (optional) and every payment is categorised for you. Budgets, goals with month-by-month plans, net worth and a daily recap.
>
> **Ask the Copilot.** Questions about your own spending, budgets, goals and portfolio, answered from your data.
>
> **Private by design.** Card numbers, UPI IDs and other identifiers are masked before anything reaches the AI. Your data is never sold. Delete your account and data any time from Settings.
>
> FinTwin gives information and maths, not investment advice. It is not a SEBI-registered investment adviser and does not recommend specific funds or stocks.

**Category:** Finance · **Tags:** Budgeting, Personal finance

**Contact email:** support@fintwin.ai · **Privacy policy:** the URL above

**Screenshots:** take them from the demo account ("Try the demo"), never a real one. Phone, at least 2, 16:9 or 9:16: Home, Invest, a fund page, Spend Guard, Goals.

## App content answers

- **Ads:** No ads.
- **App access:** Login required. In the review notes, tell reviewers to tap **"Try the demo"** on the first screen; it needs no account.
- **Target audience:** 18 and over.
- **Content rating:** Finance utility; no violence, gambling or user-to-user content.
- **Financial features declaration:** personal finance: budgeting, expense tracking, investment tracking (view only). No loans, no payments processed by the app (Spend Guard hands off to the user's own UPI app), no trading, no crypto.
- **Government app:** No. **News app:** No. **Health:** No.

### SMS permission declaration (READ_SMS)

Play allows SMS access only for listed uses. Pick **"SMS-based money management"**. Suggested text:

> FinTwin reads bank SMS, with the user's opt-in from Settings, to record their bank transactions automatically for budgeting and expense tracking. Only messages from registered bank senders that describe a completed payment are used; OTPs, balances and personal messages are ignored, and message text is not stored. The core features work without it (statement import is the alternative).

You'll need a short video of the opt-in flow (the toggle, the Android permission prompt, and the transactions appearing). Record it on the demo account.

If Google refuses, release without READ_SMS: remove the permission line from `AndroidManifest.xml`, and statement import and email alerts still work.

### Data safety

| Data type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Name, email address | Yes | No | Account management | Required |
| Phone number | Yes, if added | No | Account management, security | Optional |
| Financial info: purchase history / transactions | Yes | No* | App functionality, personalisation | Required for core features |
| Financial info: other (budgets, goals, holdings, net worth) | Yes | No* | App functionality | Optional |
| SMS (bank messages) | Yes, if turned on | No* | App functionality | Optional |
| Audio (voice question) | Yes, if turned on | No* | App functionality | Optional |
| App activity (in-app actions, AI feedback ratings) | Yes | No | Analytics, app functionality | — |

\* Processing by Google Cloud (Vertex AI) on FinTwin's behalf is a "service provider" use, which Play does not count as sharing.

- **Encrypted in transit:** Yes (HTTPS only).
- **Users can request deletion:** Yes, in Settings → Account → Delete Account (also on the web).
- **Independent security review:** No.

## Before each new upload

- Bump `versionCode` (and `versionName`) in `frontend/android/app/build.gradle`.
- Run `npm test` and `npm run aab`.
- Install the bundle on a phone through the internal-testing track first.
