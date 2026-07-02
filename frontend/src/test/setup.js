import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no IntersectionObserver; several pages use it for scroll-reveal
// animations (e.g. LandingPage). A no-op stub is enough for render tests.
globalThis.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no matchMedia either; used for responsive breakpoint checks (e.g. Header).
window.matchMedia = window.matchMedia || function () {
  return {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  };
};

// Reset DOM and localStorage between tests so suites don't leak state.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
