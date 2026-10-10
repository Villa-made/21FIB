import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '@/shared/Layout';
import { Spinner } from '@/shared/ui';
import { useAuth } from '@/features/identity/AuthContext';
import AuthPage from '@/features/identity/AuthPage';
import ContributionPage from '@/features/contributions/ContributionPage';
import ContributionStatusPage from '@/features/contributions/ContributionStatusPage';
import FeedPage from '@/features/community/FeedPage';
import LeaderboardPage from '@/features/scoring/LeaderboardPage';
import PrivacyPage from '@/shared/PrivacyPage';

/** Solo UX: la autorización real la aplica siempre el backend. */
function RequireProfile({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status !== 'ready') return <Navigate to="/acceso" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<FeedPage />} />
        <Route path="ranking" element={<LeaderboardPage />} />
        <Route path="acceso" element={<AuthPage />} />
        <Route path="privacidad" element={<PrivacyPage />} />
        <Route
          path="contribuir"
          element={
            <RequireProfile>
              <ContributionPage />
            </RequireProfile>
          }
        />
        <Route
          path="contribuciones/:id"
          element={
            <RequireProfile>
              <ContributionStatusPage />
            </RequireProfile>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
