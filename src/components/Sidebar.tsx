import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export function Sidebar() {
  const location = useLocation();
  const isDashboardGroup = ['/', '/team-dashboard', '/workload'].includes(location.pathname);
  const isReportGroup = ['/daily', '/weekly', '/match'].includes(location.pathname);
  const isDataGroup = ['/upload', '/raw-data', '/physical-raw-data'].includes(location.pathname);
  const [dashboardOpen, setDashboardOpen] = useState(isDashboardGroup);
  const [reportOpen, setReportOpen] = useState(isReportGroup);
  const [dataOpen, setDataOpen] = useState(isDataGroup);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <aside className="w-[230px] min-h-[calc(100vh-72px)] border-r border-surface-secondary bg-surface sticky top-[72px] overflow-y-auto max-h-[calc(100vh-72px)] flex-shrink-0 hide-mobile">
      <div className="py-3 border-b border-surface-secondary">
        <p
          className="px-4 mb-2 text-[10px] text-text-disabled tracking-[2px] uppercase"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          메뉴
        </p>
        <nav className="px-2 flex flex-col gap-0.5">
          {/* 홈 */}
          <NavLink to="/" end className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">🏠</span>홈
          </NavLink>

          {/* 대시보드 그룹 */}
          <button
            onClick={() => setDashboardOpen(!dashboardOpen)}
            className={`sidebar-nav-item w-full ${isDashboardGroup ? 'active' : ''}`}
          >
            <span className="w-[18px] text-center text-[13px]">📊</span>
            대시보드
            <span className={`ml-auto text-[10px] text-text-disabled transition-transform ${dashboardOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          {dashboardOpen && (
            <div className="pl-5 flex flex-col gap-0.5">
              <NavLink to="/team-dashboard" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">📈</span>팀 대시보드
              </NavLink>
              <NavLink to="/workload" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">🏃</span>개인 대시보드
              </NavLink>
            </div>
          )}

          {/* 리포트 그룹 */}
          <button
            onClick={() => setReportOpen(!reportOpen)}
            className={`sidebar-nav-item w-full ${isReportGroup ? 'active' : ''}`}
          >
            <span className="w-[18px] text-center text-[13px]">📝</span>
            리포트
            <span className={`ml-auto text-[10px] text-text-disabled transition-transform ${reportOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          {reportOpen && (
            <div className="pl-5 flex flex-col gap-0.5">
              <NavLink to="/daily" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">📅</span>데일리 리포트
              </NavLink>
              <NavLink to="/weekly" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">📆</span>위클리 리포트
              </NavLink>
              <NavLink to="/match" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">⚽</span>매치 리포트
              </NavLink>
            </div>
          )}

          <NavLink to="/acwr" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">⚡</span>ACWR 현황
          </NavLink>
          <NavLink to="/rpe" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">💪</span>RPE 모니터링
          </NavLink>
          <NavLink to="/periodization" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">🗓️</span>주간 주기화
          </NavLink>
          <NavLink
            to="/upload"
            onClick={() => setDataOpen(true)}
            className={({ isActive }) => `sidebar-nav-item ${isActive || isDataGroup ? 'active' : ''}`}
          >
            <span className="w-[18px] text-center text-[13px]">📁</span>
            데이터 관리
            <span
              onClick={e => { e.preventDefault(); e.stopPropagation(); setDataOpen(!dataOpen); }}
              className={`ml-auto text-[10px] text-text-disabled transition-transform cursor-pointer ${dataOpen ? 'rotate-180' : ''}`}
            >
              ▼
            </span>
          </NavLink>
          {dataOpen && (
            <div className="pl-5 flex flex-col gap-0.5">
              <NavLink to="/raw-data" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">📋</span>로우 데이터
              </NavLink>
              <NavLink to="/physical-raw-data" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">🦵</span>피지컬 데이터
              </NavLink>
            </div>
          )}
        </nav>
      </div>
      <div className="py-3">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full px-4 mb-2 flex items-center justify-between"
        >
          <p
            className="text-[10px] text-text-disabled tracking-[2px] uppercase"
            style={{ fontFamily: 'var(--font-data)' }}
          >
            설정
          </p>
          <span className={`text-[10px] text-text-disabled transition-transform ${settingsOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        {settingsOpen && (
          <nav className="px-2 flex flex-col gap-0.5">
            <NavLink to="/settings/players" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
              <span className="w-[18px] text-center text-[13px]">👥</span>선수 관리
            </NavLink>
          </nav>
        )}
      </div>
    </aside>
  );
}
