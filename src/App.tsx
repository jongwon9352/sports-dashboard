import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/useAuth';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { DailyReport } from './pages/DailyReport';
import { WeeklyReport } from './pages/WeeklyReport';
import { AcwrPage } from './pages/AcwrPage';
import { RpePage } from './pages/RpePage';
import { Upload } from './pages/Upload';
import { Settings } from './pages/Settings';
import { WeeklyPeriodization } from './pages/WeeklyPeriodization';
import { RawDataPage } from './pages/RawDataPage';
import { MatchReport } from './pages/MatchReport';
import { TeamDashboard } from './pages/TeamDashboard';
import { PersonalDashboard } from './pages/PersonalDashboard';
import { PhysicalDataPage } from './pages/PhysicalDataPage';
import { PhysicalOverviewPage } from './pages/PhysicalOverviewPage';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-text-secondary">로딩 중...</div>;
  }
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <div className="min-h-screen bg-bg">
            <TopNav />
            <div className="flex">
              <Sidebar />
              <main className="flex-1 min-w-0 overflow-x-hidden">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/team-dashboard" element={<TeamDashboard />} />
                  <Route path="/workload" element={<PersonalDashboard />} />
                  <Route path="/physical" element={<PhysicalOverviewPage />} />
                  <Route path="/daily" element={<DailyReport />} />
                  <Route path="/weekly" element={<WeeklyReport />} />
                  <Route path="/match" element={<MatchReport />} />
                  <Route path="/acwr" element={<AcwrPage />} />
                  <Route path="/rpe" element={<RpePage />} />
                  <Route path="/periodization" element={<WeeklyPeriodization />} />
                  <Route path="/upload" element={<Upload />} />
                  <Route path="/raw-data" element={<RawDataPage />} />
                  <Route path="/physical-data" element={<PhysicalDataPage />} />
                  <Route path="/player/:id" element={<PersonalDashboard />} />
                  <Route path="/settings/players" element={<Settings />} />
                  <Route path="/login" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </div>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
