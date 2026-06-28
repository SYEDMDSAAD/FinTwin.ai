import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import { AuthProvider } from '../context/AuthContext';

function renderProtected(initial, guarded) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/secret" element={guarded} />
      </Routes>
    </MemoryRouter>
  );
}

function renderAdmin(initial) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/" element={<div>HOME</div>} />
          <Route
            path="/admin"
            element={<AdminRoute><div>ADMIN AREA</div></AdminRoute>}
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => localStorage.clear());

  it('redirects to /login when no token is present', () => {
    renderProtected('/secret', <ProtectedRoute><div>SECRET</div></ProtectedRoute>);
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
  });

  it('renders children when a token is present', () => {
    localStorage.setItem('token', 'tok');
    renderProtected('/secret', <ProtectedRoute><div>SECRET</div></ProtectedRoute>);
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });
});

describe('AdminRoute', () => {
  beforeEach(() => localStorage.clear());

  it('redirects unauthenticated users to /login', () => {
    renderAdmin('/admin');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('redirects non-admins to home', () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', JSON.stringify({ role: 'USER' }));
    renderAdmin('/admin');
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN AREA')).not.toBeInTheDocument();
  });

  it('renders the admin area for admin users', () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', JSON.stringify({ role: 'ADMIN' }));
    renderAdmin('/admin');
    expect(screen.getByText('ADMIN AREA')).toBeInTheDocument();
  });
});
