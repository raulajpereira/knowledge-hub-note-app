import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { AgentsProvider } from './context/AgentsContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { CountsProvider } from './context/CountsContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import AppLayout from './components/AppLayout.jsx';
import Home from './pages/Home.jsx';
import Notes from './pages/Notes.jsx';
import Tasks from './pages/Tasks.jsx';
import Tags from './pages/Tags.jsx';
import Voice from './pages/Voice.jsx';
import Passwords from './pages/Passwords.jsx';
import Issues from './pages/Issues.jsx';
import Settings from './pages/Settings.jsx';
import Trash from './pages/Trash.jsx';
import Artifacts from './pages/Artifacts.jsx';
import Calendar from './pages/Calendar.jsx';
import SapNews from './pages/SapNews.jsx';

function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'oklch(0.16 0.03 280)',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      Loading…
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ConfirmProvider>
          <CountsProvider>
            <AgentsProvider>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/tags" element={<Tags />} />
                  <Route path="/voice" element={<Voice />} />
                  <Route path="/passwords" element={<Passwords />} />
                  <Route path="/issues" element={<Issues />} />
                  <Route path="/artifacts" element={<Artifacts />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/sap-news" element={<SapNews />} />
                  <Route path="/trash" element={<Trash />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AgentsProvider>
          </CountsProvider>
        </ConfirmProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
