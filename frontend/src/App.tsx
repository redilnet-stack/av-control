import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useSocket } from './hooks/useSocket.js';
import { StatusBar } from './components/StatusBar.js';
import { X32Panel } from './components/X32Panel.js';
import { AtemPanel } from './components/AtemPanel.js';
import { VideohubPanel } from './components/VideohubPanel.js';
import { ProjectorPanel } from './components/ProjectorPanel.js';
import { TvOutletsPanel } from './components/TvOutletsPanel.js';
import { ZoomPanel } from './components/ZoomPanel.js';
import { ZoomHostConsole } from './components/ZoomHostConsole.js';
import { SettingsPage } from './components/SettingsPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { SetupPage } from './pages/SetupPage.js';
import { AuthProvider, useAuth } from './auth/AuthContext.js';

function Dashboard() {
  const { socket, connected } = useSocket();

  return (
    <main className="flex-1 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <X32Panel socket={socket} connected={connected} />
          <AtemPanel socket={socket} connected={connected} />

          <VideohubPanel socket={socket} connected={connected} />
          <ProjectorPanel socket={socket} connected={connected} />
          <TvOutletsPanel />
          <a href="/zoom" className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 border-dashed flex flex-col items-center justify-center text-zinc-600 text-sm h-48 hover:border-emerald-700 hover:text-zinc-400 transition-colors group no-underline">
            <img src="/zoom.png" alt="Zoom" className="w-20 h-20 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
            <span>Zoom Broadcast</span>
            <span className="text-xs text-zinc-700 group-hover:text-zinc-500 mt-1">Click to open</span>
          </a>
        </div>
      </div>
    </main>
  );
}

function SettingsWrapper() {
  const navigate = useNavigate();
  return <SettingsPage onNavigate={() => navigate('/')} />;
}

function AppContent() {
  const { loading, setupRequired, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <StatusBar />
        <main className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          Loading...
        </main>
      </div>
    );
  }

  if (setupRequired) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <StatusBar />
        <Routes>
          <Route path="*" element={<SetupPage />} />
        </Routes>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <StatusBar />
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <StatusBar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/settings"
          element={user.role === 'admin' ? <SettingsWrapper /> : <Navigate to="/" replace />}
        />
        <Route
          path="/zoom"
          element={
            <main className="flex-1 p-4 lg:p-6">
              <div className="max-w-2xl mx-auto">
                <ZoomPanel />
              </div>
            </main>
          }
        />
        <Route
          path="/zoom/host"
          element={
            <main className="flex-1 p-4 lg:p-6">
              <div className="max-w-2xl mx-auto">
                <ZoomHostConsole />
              </div>
            </main>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}
