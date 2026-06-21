import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { fetchPlayersForSidebar } from '../lib/api';
import { getZoneColor } from '../utils/calculations';
import type { SidebarPlayer } from '../types';

export function Sidebar() {
  const [players, setPlayers] = useState<SidebarPlayer[]>([]);

  useEffect(() => {
    fetchPlayersForSidebar().then(setPlayers);
  }, []);

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
          <NavLink to="/" end className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">📊</span>팀 대시보드
          </NavLink>
          <NavLink to="/daily" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">📅</span>일별 리포트
          </NavLink>
          <NavLink to="/weekly" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">📆</span>주별 리포트
          </NavLink>
          <NavLink to="/acwr" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">⚡</span>ACWR 현황
          </NavLink>
          <NavLink to="/rpe" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">💪</span>RPE 모니터링
          </NavLink>
          <NavLink to="/upload" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
            <span className="w-[18px] text-center text-[13px]">⚙️</span>데이터 관리
          </NavLink>
        </nav>
      </div>
      <div className="py-3">
        <p
          className="px-4 mb-2 text-[10px] text-text-disabled tracking-[2px] uppercase"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          선수 ({players.length}명)
        </p>
        <div className="px-2 max-h-[calc(100vh-380px)] overflow-y-auto">
          {players.map(p => (
            <NavLink
              key={p.id}
              to={`/player/${p.id}`}
              className={({ isActive }) => `player-list-item ${isActive ? 'active' : ''}`}
            >
              <span className="truncate">{p.name}</span>
              {p.acwr != null ? (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{
                    fontFamily: 'var(--font-data)',
                    color: getZoneColor(p.zone),
                    background: `${getZoneColor(p.zone)}15`,
                  }}
                >
                  {p.acwr.toFixed(2)}
                </span>
              ) : (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded text-text-disabled flex-shrink-0"
                  style={{ fontFamily: 'var(--font-data)', background: 'var(--color-surface-secondary)' }}
                >
                  —
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  );
}
