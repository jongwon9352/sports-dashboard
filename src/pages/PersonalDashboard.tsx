import { useEffect, useState } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  fetchPlayersWithAcwr, fetchPlayerDailyData, fetchPlayerMatchHistory,
  fetchPhysicalTestRecords, computeValdValue, VALD_METRIC_DEFS,
  fetchPlayerAcwrMultiMetric, fetchTeamAcwrData,
} from '../lib/api';
import { StatCard } from '../components/StatCard';
import { getZoneColor, getZoneLabel } from '../utils/calculations';
import { chartColors } from '../styles/colors';
import {
  AcwrComboChart, computeTeamLoadRange, METRIC_KEYS, getAcwrZone, ZONE_COLOR, ZONE_LABEL,
} from './TeamDashboard';
import type { PlayerWithAcwr, TrainingDaily, MatchData } from '../types';
import type { PhysicalTestRow, TeamAcwrSeries } from '../lib/api';

type Tab = 'load' | 'match' | 'physical';
const TABS: { id: Tab; label: string }[] = [
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

// ── Load 탭: ACWR·Monotony·훈련부하 추이 ────────────────────────────────
function LoadTab({ dailyData, multiMetric, teamLoadRange }: {
  dailyData: TrainingDaily[];
  multiMetric: Record<string, TeamAcwrSeries[]>;
  teamLoadRange: Record<string, { min: number; avg: number; max: number } | null>;
}) {
  const recentDaily = dailyData.slice(0, 14).reverse();
  const dailyChart = recentDaily.map(d => ({
    date: d.training_date.slice(5),
    td: Number(d.total_distance),
    hsr: Number(d.hsr_distance),
    sprint: Number(d.sprint_distance),
  }));

  const latestDaily = dailyData[0];

  return (
    <>
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">오늘 기준 ACWR 현황</div>
      <div className="grid grid-cols-5 gap-3 mb-5 stat-grid-4">
        {METRIC_KEYS.map(({ key, label }) => {
          const series = multiMetric[key] ?? [];
          const entry = [...series].reverse().find(d => d.chronic > 0) ?? null;
          const val = entry ? +((entry.acute / entry.chronic).toFixed(2)) : null;
          const zone = getAcwrZone(val);
          return (
            <StatCard
              key={key}
              label={`${label} ACWR`}
              value={val != null ? val.toFixed(2) : '—'}
              sub={ZONE_LABEL[zone]}
              accent={ZONE_COLOR[zone]}
              valueColor={ZONE_COLOR[zone]}
            />
          );
        })}
      </div>

      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">일별 ACWR 흐름 (최근 2주)</div>
      <div className="space-y-2 mb-4">
        {METRIC_KEYS.map(({ key, label, unit }) => (
          <AcwrComboChart key={key} title={`${label} / ACWR`} data={multiMetric[key] ?? []} unit={unit || undefined}
            teamRange={teamLoadRange[key] ?? null} days={14} fitWidth />
        ))}
      </div>

      {dailyChart.length > 0 && (
        <div className="chart-card mb-4">
          <div className="chart-title">최근 훈련 TD / HSR / Sprint</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Bar dataKey="td" fill="rgba(21, 62, 111, 0.26)" radius={[3, 3, 0, 0]} name="TD(m)" />
              <Bar dataKey="hsr" fill="rgba(0, 140, 126, 0.30)" radius={[3, 3, 0, 0]} name="HSR(m)" />
              <Bar dataKey="sprint" fill="rgba(164, 40, 67, 0.28)" radius={[3, 3, 0, 0]} name="Sprint(m)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {latestDaily && (
        <div className="chart-card">
          <div className="chart-title">최근 훈련 데이터 ({latestDaily.training_date})</div>
          <div className="grid grid-cols-4 gap-4 stat-grid-4">
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>총 뛴 거리</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.total_distance).toLocaleString()} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>HSR</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.hsr_distance).toFixed(1)} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>Sprint</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.sprint_distance).toFixed(1)} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>최고 속도</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.max_speed).toFixed(1)} km/h</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Match 탭: 경기 기록 ──────────────────────────────────────────────────
function MatchTabPanel({ matches }: { matches: MatchData[] }) {
  if (matches.length === 0) {
    return <div className="chart-card text-center text-text-secondary py-8">경기 기록이 없습니다.</div>;
  }
  return (
    <div className="chart-card">
      <div className="chart-title">경기 기록 ({matches.length}경기)</div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>대회</th>
              <th>상대</th>
              <th>포지션</th>
              <th className="right">출전(분)</th>
              <th className="right">TD(m)</th>
              <th className="right">HSR(m)</th>
              <th className="right">Sprint(m)</th>
              <th className="right">Max Speed</th>
              <th className="right">RPE</th>
            </tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.id} style={{ cursor: 'default' }}>
                <td style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>{m.match_date}</td>
                <td>{m.event_type}</td>
                <td className="name">{m.opponent}</td>
                <td>{m.position_played ?? '—'}</td>
                <td className="num">{Number(m.play_time_min) || '—'}</td>
                <td className="num">{Number(m.total_distance) ? Math.round(Number(m.total_distance)).toLocaleString() : '—'}</td>
                <td className="num">{Number(m.hsr_distance) ? Math.round(Number(m.hsr_distance)).toLocaleString() : '—'}</td>
                <td className="num">{Number(m.sprint_distance) ? Math.round(Number(m.sprint_distance)).toLocaleString() : '—'}</td>
                <td className="num">{Number(m.max_speed) ? Number(m.max_speed).toFixed(1) : '—'}</td>
                <td className="num">{m.rpe ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Physical 탭: VALD 최신 측정값 ────────────────────────────────────────
function PhysicalTabPanel({ record }: { record: PhysicalTestRow | null }) {
  if (!record) {
    return <div className="chart-card text-center text-text-secondary py-8">VALD 측정 기록이 없습니다.</div>;
  }
  return (
    <div className="chart-card">
      <div className="chart-title">VALD 최신 측정 ({record.test_date})</div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>항목</th>
              <th className="right">값</th>
            </tr>
          </thead>
          <tbody>
            {VALD_METRIC_DEFS.map(m => {
              const val = computeValdValue(m.key, record);
              if (val == null) return null;
              return (
                <tr key={m.key} style={{ cursor: 'default' }}>
                  <td className="name">{m.label}</td>
                  <td className="num">{val.toFixed(m.unit === 'sec' ? 3 : m.key === 'eur' ? 2 : 1)}{m.unit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PersonalDashboard() {
  const [players, setPlayers] = useState<PlayerWithAcwr[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('load');

  const [dailyData, setDailyData] = useState<TrainingDaily[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [physicalRecord, setPhysicalRecord] = useState<PhysicalTestRow | null>(null);
  const [multiMetric, setMultiMetric] = useState<Record<string, TeamAcwrSeries[]>>({});
  const [teamLoadRange, setTeamLoadRange] = useState<Record<string, { min: number; avg: number; max: number } | null>>({});

  useEffect(() => {
    fetchPlayersWithAcwr().then(p => {
      setPlayers(p);
      if (p.length > 0) setSelectedId(p[0].id);
      setLoading(false);
    });
    fetchTeamAcwrData(210).then(teamData => {
      const range = Object.fromEntries(
        METRIC_KEYS.map(({ key }) => [key, computeTeamLoadRange(teamData[key as keyof typeof teamData])]),
      );
      setTeamLoadRange(range);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    Promise.all([
      fetchPlayerAcwrMultiMetric(selectedId, 90),
      fetchPlayerDailyData(selectedId),
      fetchPlayerMatchHistory(selectedId),
      fetchPhysicalTestRecords(),
    ]).then(([multi, daily, matchData, physicalRows]) => {
      if (!active) return;
      setMultiMetric(multi);
      setDailyData(daily);
      setMatches(matchData);
      const own = physicalRows.filter(r => r.player_id === selectedId).sort((a, b) => b.test_date.localeCompare(a.test_date));
      setPhysicalRecord(own[0] ?? null);
    });
    return () => { active = false; };
  }, [selectedId]);

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
              <div className="flex items-center gap-3 text-text-secondary text-sm mt-1 flex-wrap">
                <span>{player.position} · {player.grade}</span>
                <span
                  className="zone-badge"
                  style={{
                    color: getZoneColor(player.acwr_zone),
                    background: `${getZoneColor(player.acwr_zone)}15`,
                  }}
                >
                  {getZoneLabel(player.acwr_zone)}
                  {player.acwr_data?.acwr != null && ` ${Number(player.acwr_data.acwr).toFixed(2)}`}
                </span>
              </div>
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

        {player && tab === 'load' && <LoadTab dailyData={dailyData} multiMetric={multiMetric} teamLoadRange={teamLoadRange} />}
        {tab === 'match' && <MatchTabPanel matches={matches} />}
        {tab === 'physical' && <PhysicalTabPanel record={physicalRecord} />}
      </div>
    </div>
  );
}
