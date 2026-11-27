// Tests run in jsdom, where the wake word's WASM engine can't load; components
// that would use it are tested with services/wakeWord mocked.
export const PorcupineWorker = { create: () => Promise.reject(new Error("no wake word in tests")) };
export const WebVoiceProcessor = { subscribe: async () => {}, unsubscribe: async () => {} };
