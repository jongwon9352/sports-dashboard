import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { DailyReport } from './pages/DailyReport';
import { WeeklyReport } from './pages/WeeklyReport';
import { AcwrPage } from './pages/AcwrPage';
import { RpePage } from './pages/RpePage';
import { Upload } from './pages/Upload';
import { PlayerProfile } from './pages/PlayerProfile';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg">
        <TopNav />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-x-hidden">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/daily" element={<DailyReport />} />
              <Route path="/weekly" element={<WeeklyReport />} />
              <Route path="/acwr" element={<AcwrPage />} />
              <Route path="/rpe" element={<RpePage />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/player/:id" element={<PlayerProfile />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
