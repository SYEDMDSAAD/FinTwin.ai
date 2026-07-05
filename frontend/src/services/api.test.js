import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import API, { identityApi } from './api';

describe('api interceptors', () => {
  let apiMock, idMock, axiosMock;

  beforeEach(() => {
    localStorage.clear();
    apiMock = new MockAdapter(API);
    idMock = new MockAdapter(identityApi);
    axiosMock = new MockAdapter(axios); // the raw instance used for /auth/refresh
    // clearAuthAndRedirect sets window.location.href — make it a writable stub.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    apiMock.restore();
    idMock.restore();
    axiosMock.restore();
  });

  it('attaches the bearer token from localStorage to outgoing requests', async () => {
    localStorage.setItem('token', 'abc123');
    let seenAuth;
    idMock.onGet('/profile').reply((config) => {
      seenAuth = config.headers.Authorization;
      return [200, {}];
    });

    await identityApi.get('/profile');
    expect(seenAuth).toBe('Bearer abc123');
  });

  it('refreshes the access token on 401 and retries the original request', async () => {
    localStorage.setItem('token', 'old');
    localStorage.setItem('refreshToken', 'r1');

    idMock.onGet('/me').replyOnce(401);
    axiosMock.onPost('/api/auth/refresh').reply(200, { accessToken: 'new', refreshToken: 'r2' });
    idMock.onGet('/me').reply(200, { ok: true });

    const res = await identityApi.get('/me');

    expect(res.data).toEqual({ ok: true });
    expect(localStorage.getItem('token')).toBe('new');
    expect(localStorage.getItem('refreshToken')).toBe('r2');
  });

  it('clears auth and redirects to /login when there is no refresh token', async () => {
    localStorage.setItem('token', 'old');
    idMock.onGet('/me').reply(401);

    await expect(identityApi.get('/me')).rejects.toBeTruthy();

    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('does not attempt a refresh for /auth/ endpoints', async () => {
    localStorage.setItem('refreshToken', 'r1');
    idMock.onPost('/auth/login').reply(401);

    await expect(identityApi.post('/auth/login', {})).rejects.toBeTruthy();

    const refreshCalls = axiosMock.history.post.filter((r) => r.url.includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(0);
    expect(window.location.href).toBe(''); // no forced redirect on the auth path
  });

  it('refreshes and retries on a 401 from the main backend API', async () => {
    localStorage.setItem('token', 'old');
    localStorage.setItem('refreshToken', 'r1');

    apiMock.onGet('/dashboard').replyOnce(401);
    axiosMock.onPost('/api/auth/refresh').reply(200, { accessToken: 'new', refreshToken: 'r2' });
    apiMock.onGet('/dashboard').reply(200, { ok: true });

    const res = await API.get('/dashboard');

    expect(res.data).toEqual({ ok: true });
    expect(localStorage.getItem('token')).toBe('new');
    // Session survives — no forced redirect
    expect(window.location.href).toBe('');
  });

  it('logs the user out on a backend 401 when no refresh token exists', async () => {
    apiMock.onGet('/dashboard').reply(401);
    await expect(API.get('/dashboard')).rejects.toBeTruthy();
    expect(window.location.href).toBe('/login');
  });
});
