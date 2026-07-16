import { useEffect, useState } from 'react';
import {
  BarChart, Bar, Legend,
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
// 개인 Match 탭에서 비교할 지표 목록 (엑셀 '대시보드' 시트의 지표 구성 기준, 목표(Goal)는 외부 벤치마크가 없어 제외)
const MATCH_METRICS: { key: keyof MatchData; label: string; unit: string }[] = [
  { key: 'total_distance', label: 'TD', unit: 'm' },
  { key: 'm_per_min', label: 'm/min', unit: '' },
  { key: 'hsr_distance', label: 'HSR', unit: 'm' },
  { key: 'sprint_distance', label: 'Sprint', unit: 'm' },
  { key: 'sprint_count', label: 'Sprint 횟수', unit: '회' },
  { key: 'acc_count', label: 'ACC', unit: '회' },
  { key: 'dec_count', label: 'DEC', unit: '회' },
  { key: 'action_count', label: 'Action', unit: '회' },
  { key: 'acd_load', label: 'ACD Load', unit: '' },
  { key: 'max_speed', label: 'Max Speed', unit: 'km/h' },
];

const ZONE_KEYS: { key: keyof MatchData; label: string }[] = [
  { key: 'speed_zone_1', label: 'Zone1' },
  { key: 'speed_zone_2', label: 'Zone2' },
  { key: 'speed_zone_3', label: 'Zone3' },
  { key: 'speed_zone_4', label: 'Zone4' },
  { key: 'speed_zone_5', label: 'Zone5' },
];

function avgOf(rows: MatchData[], key: keyof MatchData): number {
  const vals = rows.map(r => Number(r[key]) || 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function maxOf(rows: MatchData[], key: keyof MatchData): number {
  return rows.length ? Math.max(...rows.map(r => Number(r[key]) || 0)) : 0;
}

function DeltaText({ last, ref, refLabel }: { last: number; ref: number; refLabel: string }) {
  if (ref === 0) return null;
  const diff = last - ref;
  const pct = (diff / ref) * 100;
  const color = diff === 0 ? 'text-text-secondary' : diff > 0 ? 'text-green-600' : 'text-red-500';
  return (
    <span className={`text-[10px] font-medium ${color}`}>
      {refLabel} 대비 {diff === 0 ? '동일' : `${diff > 0 ? '+' : ''}${pct.toFixed(0)}%`}
    </span>
  );
}

// 지표별 Avg/Last/Total Peak 비교 카드 + 미니 바 차트
// 좁은 카드 폭에서는 recharts 미니 바 차트의 카테고리 폭이 너무 좁아져 막대가 렌더링되지 않는
// 경우가 있어(narrow-width edge case), CSS 기반 범위 바로 대체해 항상 안정적으로 그린다.
function MetricCompareCard({ label, unit, avgVal, lastVal, peakVal }: {
  label: string; unit: string; avgVal: number; lastVal: number; peakVal: number;
}) {
  const max = Math.max(peakVal, avgVal, lastVal, 1);
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  const lastColor = lastVal >= avgVal ? '#A42843' : '#153E6F';
  const fmt = (v: number) => (unit === 'sec' ? v.toFixed(2) : v.toLocaleString());

  return (
    <div className="chart-card">
      <div className="chart-title !mb-1">{label}</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-data)' }}>{lastVal.toLocaleString()}{unit}</span>
        <DeltaText last={lastVal} ref={avgVal} refLabel="평균" />
      </div>

      <div className="relative h-2 rounded-full bg-gray-100 mb-1">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(lastVal)}%`, background: lastColor }} />
        <div className="absolute -top-0.5 w-0.5 h-3 bg-gray-400" style={{ left: `${pct(avgVal)}%` }} title="평균" />
      </div>
      <div className="flex justify-between text-[9px] text-text-secondary">
        <span>평균 {fmt(avgVal)}{unit}</span>
        <span>Peak {fmt(peakVal)}{unit}</span>
      </div>
    </div>
  );
}

function PersonalMatchTab({ matches }: { matches: MatchData[] }) {
  const [eventFilter, setEventFilter] = useState('전체');
  const [groupFilter, setGroupFilter] = useState('전체');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const eventTypes = ['전체', ...new Set(matches.map(m => m.event_type))];
  const groups = ['전체', ...new Set(matches.map(m => m.player_group).filter((g): g is string => !!g))];

  const filteredMatches = matches.filter(m =>
    (eventFilter === '전체' || m.event_type === eventFilter) &&
    (groupFilter === '전체' || m.player_group === groupFilter),
  );

  // 비교 경기 드롭다운은 필터된 목록에서 고르되, 실제 값은 그룹 필터와 무관하게 그 경기 원본 기록을 그대로 사용한다.
  const matchOptions = [...filteredMatches]
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
    .map(m => ({ key: `${m.match_date}__${m.opponent}`, label: `${m.opponent} (${m.match_date.slice(5)}) · ${m.event_type}` }));

  const lastRow = selectedKey
    ? matches.find(m => `${m.match_date}__${m.opponent}` === selectedKey) ?? null
    : filteredMatches[0] ?? matches[0] ?? null;

  if (matches.length === 0) {
    return <div className="chart-card text-center text-text-secondary py-8">경기 기록이 없습니다.</div>;
  }

  const zoneData = ZONE_KEYS.map(z => {
    const avgTd = avgOf(filteredMatches, 'total_distance');
    const avgZone = avgOf(filteredMatches, z.key);
    const lastTd = Number(lastRow?.total_distance) || 0;
    const lastZone = lastRow ? Number(lastRow[z.key]) || 0 : 0;
    return {
      zone: z.label,
      평균: avgTd > 0 ? +((avgZone / avgTd) * 100).toFixed(1) : 0,
      선택경기: lastTd > 0 ? +((lastZone / lastTd) * 100).toFixed(1) : 0,
    };
  });

  return (
    <>
      <div className="chart-card mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-text-secondary w-16">경기 타입</span>
          {eventTypes.map(et => (
            <button
              key={et}
              onClick={() => setEventFilter(et)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                eventFilter === et ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {et}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-text-secondary w-16">경기 연령</span>
          {groups.map(g => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                groupFilter === g ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-secondary w-16">비교 경기</span>
          <select
            value={selectedKey ?? ''}
            onChange={e => setSelectedKey(e.target.value || null)}
            className="text-xs border border-surface-secondary rounded-lg px-2 py-1 bg-surface"
          >
            <option value="">최근 경기 (자동)</option>
            {matchOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span className="text-[11px] text-text-secondary">필터된 {filteredMatches.length}경기 평균 · 커리어 최고(Peak)는 전체 경기 기준</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-4 stat-grid-4">
        {MATCH_METRICS.map(m => (
          <MetricCompareCard
            key={m.key}
            label={m.label}
            unit={m.unit}
            avgVal={avgOf(filteredMatches, m.key)}
            lastVal={lastRow ? Number(lastRow[m.key]) || 0 : 0}
            peakVal={maxOf(matches, m.key)}
          />
        ))}
      </div>

      <div className="chart-card mb-4">
        <div className="chart-title">속도 구간(Zone) 분포 — 평균 vs 선택 경기 (TD 대비 %)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={zoneData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
            <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} formatter={(v: any) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="평균" fill="#153E6F99" radius={[3, 3, 0, 0]} />
            <Bar dataKey="선택경기" fill="#A42843" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

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
    </>
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
        {tab === 'match' && <PersonalMatchTab matches={matches} />}
        {tab === 'physical' && <PhysicalTabPanel record={physicalRecord} />}
      </div>
    </div>
  );
}
