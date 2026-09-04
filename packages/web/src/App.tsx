import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './api/AuthContext';
import Login from './pages/Login';
import Main from './pages/Main';

const Settings = lazy(() => import('./pages/Settings'));
const Storage = lazy(() => import('./pages/Storage'));

function LoadingShell() {
  return (
    <div style={{ padding: 40, color: 'var(--text-faint)', fontSize: 12 }}>Loading…</div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingShell />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingShell />}>{children}</Suspense>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Main />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <LazyRoute>
              <Settings />
            </LazyRoute>
          }
        />
        <Route
          path="/storage"
          element={
            <LazyRoute>
              <Storage />
            </LazyRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
