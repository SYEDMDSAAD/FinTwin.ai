import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Reset DOM and localStorage between tests so suites don't leak state.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
