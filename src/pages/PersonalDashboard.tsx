import { useEffect, useState } from 'react';
import { fetchPlayersWithAcwr } from '../lib/api';
import type { PlayerWithAcwr } from '../types';

type Tab = 'overall' | 'load' | 'match' | 'physical';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'load', label: 'Load' },
  { id: 'match', label: 'Match' },
  { id: 'physical', label: 'Physical' },
];

function PlayerAvatar({ src, size = 40 }: { src?: string | null; size?: number }) {
  return src ? (
    <img src={src} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} alt="" />
  ) : (
    <div className="rounded-full bg-surface-secondary flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <span style={{ fontSize: size * 0.45 }} className="text-text-disabled">👤</span>
    </div>
  );
}

export function PersonalDashboard() {
  const [players, setPlayers] = useState<PlayerWithAcwr[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overall');

  useEffect(() => {
    fetchPlayersWithAcwr().then(p => {
      setPlayers(p);
      if (p.length > 0) setSelectedId(p[0].id);
      setLoading(false);
    });
  }, []);

  const player = players.find(p => p.id === selectedId) ?? null;

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">Loading...</div>;
  }

  return (
    <div className="flex">
      {/* 선수 이름 사이드바 */}
      <aside className="w-[200px] min-h-[calc(100vh-72px)] border-r border-surface-secondary bg-surface flex-shrink-0 overflow-y-auto max-h-[calc(100vh-72px)] hide-mobile">
        <div className="py-3">
          <p
            className="px-4 mb-2 text-[10px] text-text-disabled tracking-[2px] uppercase"
            style={{ fontFamily: 'var(--font-data)' }}
          >
            선수 목록
          </p>
          <nav className="px-2 flex flex-col gap-0.5">
            {players.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`sidebar-nav-item w-full ${selectedId === p.id ? 'active' : ''}`}
              >
                <PlayerAvatar src={p.photo_url} size={24} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* 콘텐츠 */}
      <div className="p-6 flex-1 min-w-0">
        <div className="sec-title">개인 대시보드</div>

        {player && (
          <div className="chart-card flex items-center gap-4 mb-4">
            <PlayerAvatar src={player.photo_url} size={56} />
            <div>
              <h1 className="text-xl font-bold">{player.name}</h1>
              <div className="text-text-secondary text-sm">{player.position} · {player.grade}</div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                tab === id ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 탭 내용은 다음 단계에서 채운다 */}
      </div>
    </div>
  );
}
