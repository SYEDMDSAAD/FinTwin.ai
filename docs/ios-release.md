# iPhone app

The iPhone app is the same web app inside Capacitor, like the Android one. The project lives in `frontend/ios/`.

## Ready in the repo

- Xcode project `frontend/ios/App`:
  - bundle id `ai.fintwin.app`, version 0.2.0 (build 2);
  - Swift Package Manager, so no CocoaPods.
- App icon and splash in the FinTwin purple "F".
- Permission texts:
  - **Camera:** QR scan in Spend Guard.
  - **Microphone:** "Hey FinTwin" and the mic button.
  - **Export compliance:** declared as HTTPS only, so App Store Connect won't ask each upload.
- **Notch and status bar:** the page starts below them (`html.native-ios` in `index.css`), and the bottom bar already respects the home indicator.
- `npm run build:ios` (in `frontend/`): web build pointed at the live API, synced into the Xcode project.
- **CI** (`.github/workflows/ci-ios.yml`) builds the app for the simulator, unsigned, on a macOS runner. It runs on every change to the iOS project and can be started by hand. The built `.app` is kept for 7 days as an artifact.

## What's different from Android

- **No SMS reading.** iOS doesn't let any app read messages, so the feature hides itself on iPhone. iPhone users get transactions from:
  - statement import;
  - forwarded bank alert emails;
  - the iPhone Shortcut (Add data → "Bank SMS on iPhone"), which sends each bank SMS through an Automation.
- **Google sign-in is off until it's set up** (see below). Until then iPhone users sign in with email and password, or use "Try the demo".

## Only you can do these

1. **A Mac with Xcode,** or use a cloud Mac. The CI job proves the project builds, but signing and uploading need Xcode.
2. **Apple Developer Program** (US$99/year), on the account that will own the app.
3. In Xcode, open `frontend/ios/App/App.xcodeproj`, then:
   - Signing & Capabilities → choose your Team;
   - keep the bundle id `ai.fintwin.app`, or change it here and in `frontend/capacitor.config.json`.
4. Build: `cd frontend && npm run build:ios`. Then in Xcode, Product → Archive → Distribute → App Store Connect. The build lands in TestFlight.
5. **TestFlight** for the beta users (up to 10,000 testers, no review for internal testers).
6. **App Store review:**
   - **Review notes:** "Tap 'Try the demo' on the first screen; no account needed."
   - **Account deletion:** in the app already (Settings → Account → Delete Account), which Apple requires.
   - **Privacy labels:** the same answers as Play's data-safety table in `docs/play-store-release.md`, minus SMS.
   - **Wording:** "information and maths, not investment advice" stays in the description.

## Google sign-in on iPhone (optional, later)

Apple's guideline 4.8: an app that offers Google sign-in must also offer an equivalent privacy-friendly option. Usually that's **Sign in with Apple**. So the plan is:

- **First release:** email/password only. This is what the code does now: the Google button hides when no iOS client is configured.
- **Later**, to add Google:
  1. Google Cloud Console → Credentials → create an **iOS** OAuth client for bundle id `ai.fintwin.app`.
  2. Build the app with `VITE_GOOGLE_IOS_CLIENT_ID=<that client id>`.
  3. Add its reversed client id (`com.googleusercontent.apps.…`) as a URL scheme in `ios/App/App/Info.plist` (URL Types).
  4. Set `GOOGLE_IOS_CLIENT_ID` on `fintwin-auth`, so the identity service accepts tokens issued to the iOS client.
  5. Add Sign in with Apple at the same time, which needs its own backend endpoint.

## Before each new upload

- Bump the version and build number in Xcode (General → Identity).
- Run `npm test` and `npm run build:ios`.
- Archive.
