import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { AgentsProvider } from './context/AgentsContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { CountsProvider } from './context/CountsContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import SuspendedAccount from './pages/SuspendedAccount.jsx';
import AppLayout from './components/AppLayout.jsx';
import Home from './pages/Home.jsx';
import Notes from './pages/Notes.jsx';
import Tasks from './pages/Tasks.jsx';
import Tags from './pages/Tags.jsx';
import Voice from './pages/Voice.jsx';
import Passwords from './pages/Passwords.jsx';
import Issues from './pages/Issues.jsx';
import Projects from './pages/Projects.jsx';
import Settings from './pages/Settings.jsx';
import Trash from './pages/Trash.jsx';
import Artifacts from './pages/Artifacts.jsx';
import Calendar from './pages/Calendar.jsx';
import SapNews from './pages/SapNews.jsx';
import CodeLibrary from './pages/CodeLibrary.jsx';
import Transactions from './pages/Transactions.jsx';
import Documentacao from './pages/Documentacao.jsx';
import Clients from './pages/Clients.jsx';
import SapSystems from './pages/SapSystems.jsx';
import TransportRequests from './pages/TransportRequests.jsx';
import Contacts from './pages/Contacts.jsx';
import Emails from './pages/Emails.jsx';
import Graph from './pages/Graph.jsx';
import ApiPlayground from './pages/ApiPlayground.jsx';
import SharedNote from './pages/SharedNote.jsx';
import FeatureRoute from './components/FeatureRoute.jsx';

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
        <Route path="/s/:token" element={<SharedNote />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (user.status === 'suspended') {
    return <SuspendedAccount />;
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ConfirmProvider>
          <CountsProvider>
            <AgentsProvider>
              <Routes>
                <Route path="/s/:token" element={<SharedNote />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/notes" element={<FeatureRoute feature="notes"><Notes /></FeatureRoute>} />
                  <Route path="/tasks" element={<FeatureRoute feature="tasks"><Tasks /></FeatureRoute>} />
                  <Route path="/tags" element={<Tags />} />
                  <Route path="/voice" element={<FeatureRoute feature="voice"><Voice /></FeatureRoute>} />
                  <Route path="/passwords" element={<FeatureRoute feature="passwords"><Passwords /></FeatureRoute>} />
                  <Route path="/issues" element={<FeatureRoute feature="issues"><Issues /></FeatureRoute>} />
                  <Route path="/projects" element={<FeatureRoute feature="projects"><Projects /></FeatureRoute>} />
                  <Route path="/artifacts" element={<FeatureRoute feature="artifacts"><Artifacts /></FeatureRoute>} />
                  <Route path="/code-library" element={<FeatureRoute feature="codeLibrary"><CodeLibrary /></FeatureRoute>} />
                  <Route path="/transactions" element={<FeatureRoute feature="transactions"><Transactions /></FeatureRoute>} />
                  <Route path="/documentacao" element={<FeatureRoute feature="documentacao"><Documentacao /></FeatureRoute>} />
                  <Route path="/clients" element={<FeatureRoute feature="clients"><Clients /></FeatureRoute>} />
                  <Route path="/sap-systems" element={<FeatureRoute feature="sapSystems"><SapSystems /></FeatureRoute>} />
                  <Route path="/transport-requests" element={<FeatureRoute feature="transportRequests"><TransportRequests /></FeatureRoute>} />
                  <Route path="/contacts" element={<FeatureRoute feature="contacts"><Contacts /></FeatureRoute>} />
                  <Route path="/emails" element={<FeatureRoute feature="emails"><Emails /></FeatureRoute>} />
                  <Route path="/calendar" element={<FeatureRoute feature="calendar"><Calendar /></FeatureRoute>} />
                  <Route path="/graph" element={<FeatureRoute feature="graph"><Graph /></FeatureRoute>} />
                  <Route path="/playground" element={<FeatureRoute feature="apiPlayground"><ApiPlayground /></FeatureRoute>} />
                  <Route path="/sap-news" element={<FeatureRoute feature="sapNews"><SapNews /></FeatureRoute>} />
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
