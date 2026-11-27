# "Hey FinTwin" wake word files

The wake word runs on the device with Picovoice Porcupine. Two files go here,
plus a build-time key:

1. `hey-fintwin.ppn`: the "Hey FinTwin" keyword, trained in the Picovoice
   Console (console.picovoice.ai → Porcupine → type "Hey FinTwin" → platform
   **Web (WASM)** → download). Rename the downloaded file to `hey-fintwin.ppn`.
2. `porcupine_params.pv`: the English model, from the Porcupine GitHub repo
   (`lib/common/porcupine_params.pv`), matching @picovoice/porcupine-web 4.x.
3. `VITE_PICOVOICE_ACCESS_KEY`: the AccessKey from the console, passed to the
   web build (Cloud Build substitution) and to the Android build's `.env`.

Without them the mic button still works (tap to ask); only "Hey FinTwin" is off.
