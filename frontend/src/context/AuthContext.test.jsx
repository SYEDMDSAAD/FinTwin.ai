import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// AuthContext.logout calls identityApi.post — mock the api module so no network.
vi.mock('../services/api', () => ({
  __esModule: true,
  default: {},
  identityApi: { post: vi.fn().mockResolvedValue({}) },
}));

import { AuthProvider, useAuth } from './AuthContext';
import { identityApi } from '../services/api';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    identityApi.post.mockClear();
  });

  it('starts unauthenticated with empty storage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });

  it('hydrates an existing session from localStorage', () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', JSON.stringify({ email: 'a@b.c', role: 'ADMIN' }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.user.email).toBe('a@b.c');
  });

  it('login() persists token, refresh token and user, and flips auth state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.login('access1', { email: 'u@x.io', role: 'USER' }, 'refresh1'));

    expect(localStorage.getItem('token')).toBe('access1');
    expect(localStorage.getItem('refreshToken')).toBe('refresh1');
    expect(JSON.parse(localStorage.getItem('user')).email).toBe('u@x.io');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it('logout() revokes the refresh token and clears local state', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'r1');
    localStorage.setItem('user', JSON.stringify({ role: 'USER' }));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { await result.current.logout(); });

    expect(identityApi.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'r1' });
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logoutSync() clears state without calling the API', () => {
    localStorage.setItem('token', 'tok');
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => result.current.logoutSync());
    expect(localStorage.getItem('token')).toBeNull();
    expect(identityApi.post).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('consumes a one-time impersonation token on init', () => {
    localStorage.setItem('_imp_token', 'imp-tok');
    localStorage.setItem('_imp_user', JSON.stringify({ email: 'target@x.io', role: 'USER' }));
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.token).toBe('imp-tok');
    expect(localStorage.getItem('token')).toBe('imp-tok');
    expect(localStorage.getItem('_imp_token')).toBeNull(); // consumed
    expect(result.current.user.email).toBe('target@x.io');
  });

  it('tolerates corrupt user JSON in storage (no crash, null user)', () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', '{ not valid json');
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(true); // token still valid
  });
});
