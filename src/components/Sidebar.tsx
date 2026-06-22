import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export function Sidebar() {
  const location = useLocation();
  const isDashboardGroup = ['/', '/daily', '/weekly'].includes(location.pathname);
  const [dashboardOpen, setDashboardOpen] = useState(isDashboardGroup);
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
          {/* 팀 대시보드 그룹 */}
          <NavLink
            to="/"
            end
            onClick={() => setDashboardOpen(true)}
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="w-[18px] text-center text-[13px]">📊</span>
            팀 대시보드
            <span
              onClick={e => { e.preventDefault(); e.stopPropagation(); setDashboardOpen(!dashboardOpen); }}
              className={`ml-auto text-[10px] text-text-disabled transition-transform cursor-pointer ${dashboardOpen ? 'rotate-180' : ''}`}
            >
              ▼
            </span>
          </NavLink>
          {dashboardOpen && (
            <div className="pl-5 flex flex-col gap-0.5">
              <NavLink to="/daily" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">📅</span>데일리 리포트
              </NavLink>
              <NavLink to="/weekly" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
                <span className="w-[18px] text-center text-[13px]">📆</span>위클리 리포트
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
          <NavLink to="/upload" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">📁</span>데이터 관리
          </NavLink>
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
