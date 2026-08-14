import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Overview from './pages/Overview.jsx';
import CodeRequests from './pages/CodeRequests.jsx';
import CreateCodes from './pages/CreateCodes.jsx';
import Accounts from './pages/Accounts.jsx';
import Templates from './pages/Templates.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import VpsManagement from './pages/VpsManagement.jsx';
import Appearance from './pages/Appearance.jsx';

function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'oklch(0.12 0.018 42)', color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      Loading…
    </div>
  );
}

function AuthedApp() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ConfirmProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/pedidos-de-codigo" element={<CodeRequests />} />
          <Route path="/criar-codigos" element={<CreateCodes />} />
          <Route path="/contas" element={<Accounts />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/logs" element={<ActivityLog />} />
          <Route path="/vps" element={<VpsManagement />} />
          <Route path="/aparencia" element={<Appearance />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConfirmProvider>
  );
}

export default function App() {
  const { loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  // Theme/Language wrap both the login screen and the authenticated shell —
  // unlike the main app, neither depends on a logged-in user (both persist
  // to localStorage instead of the account's settings), so there's no need
  // to gate them behind auth the way the product app does.
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthedApp />
      </LanguageProvider>
    </ThemeProvider>
  );
}
