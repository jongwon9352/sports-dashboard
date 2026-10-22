import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import {
  BarChart, Bar, Legend, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Cell, LabelList, ReferenceLine,
} from 'recharts';
import type { RenderableText } from 'recharts/types/component/Text';
import {
  fetchPlayersWithAcwr, fetchPlayerDailyData, fetchPlayerMatchHistory,
  fetchPhysicalTestRecords, computeValdValue, VALD_METRIC_DEFS, VALD_ACCESSORS,
  fetchPlayerAcwrMultiMetric, fetchTeamAcwrData, fetchValdThresholds,
  fetchBodyCompositionRecords, fetchMaturityRecords, fetchSpeedCustomRecords, fetchSpeedCustomTestRows,
} from '../lib/api';
import { StatCard } from '../components/StatCard';
import { getZoneColor, getZoneLabel } from '../utils/calculations';
import { chartColors, colors } from '../styles/colors';
import {
  AcwrComboChart, computeTeamLoadRange, METRIC_KEYS, getAcwrZone, ZONE_COLOR, ZONE_LABEL,
} from './TeamDashboard';
import type { PlayerWithAcwr, TrainingDaily, MatchData } from '../types';
import type { PhysicalTestRow, TeamAcwrSeries, BodyCompositionRow, MaturityRow, SpeedCustomRow, SpeedCustomTestRow, ValdThreshold } from '../lib/api';

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
              <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>총 뛴 거리</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.total_distance).toLocaleString()} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>HSR</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.hsr_distance).toFixed(1)} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>Sprint</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.sprint_distance).toFixed(1)} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>최고 속도</p>
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
  label: string; unit: string; avgVal: number; lastVal: number | null; peakVal: number;
}) {
  const max = Math.max(peakVal, avgVal, lastVal ?? 0, 1);
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  const lastColor = lastVal != null && lastVal >= avgVal ? '#A42843' : '#153E6F';
  const fmt = (v: number) => (unit === 'sec' ? v.toFixed(2) : v.toLocaleString());
  const headline = lastVal ?? avgVal;

  return (
    <div className="chart-card">
      <div className="chart-title !mb-1">{label}</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-data)' }}>{headline.toLocaleString()}{unit}</span>
        {lastVal != null
          ? <DeltaText last={lastVal} ref={avgVal} refLabel="평균" />
          : <span className="text-[10px] text-text-secondary">평균값</span>}
      </div>

      <div className="relative h-2 rounded-full bg-gray-100 mb-1">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(headline)}%`, background: lastVal != null ? lastColor : '#9ca3af' }} />
        {lastVal != null && (
          <div className="absolute -top-0.5 w-0.5 h-3 bg-gray-400" style={{ left: `${pct(avgVal)}%` }} title="평균" />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-text-secondary">
        <span>평균 {fmt(avgVal)}{unit}</span>
        <span>Peak {fmt(peakVal)}{unit}</span>
      </div>
    </div>
  );
}

// 같은 대회가 "K리그주니어"/"K리그 주니어"/"k리그주니어"처럼 표기가 섞여 들어오는 경우가 있어
// 공백·대소문자를 무시하고 하나로 합친다 (팀 대시보드 Match 탭과 동일한 정규화).
function normalizeEventType(et: string): string {
  return et.replace(/\s/g, '').toLowerCase();
}

// 비교 경기 드롭다운의 "없음" 값. 자동(null)과 구분해서 비교 자체를 끈다(팀 대시보드 Match 탭과 동일한 패턴).
const NO_COMPARISON = '__none__';

// 팀 대시보드 Match 탭의 "타입/그룹끼리 비교"와 동일한 패턴.
const COMPARE_COLORS = ['#2563eb', '#16a34a', '#f97316', '#a855f7', '#db2777', '#0891b2', '#ca8a04'];

// 비교 계열 하나 = 막대 한 개. 타입만·그룹만·둘 다 켠 경우를 같은 모양으로 다룬다.
interface CompareSeries { label: string; match: (m: MatchData) => boolean; }

// 타입과 그룹을 동시에 켜면 조합별로 비교한다(예: K리그주니어 · U15).
function buildCompareSeries(types: string[], groups: string[]): CompareSeries[] {
  const byType = (t: string) => (m: MatchData) => normalizeEventType(m.event_type) === normalizeEventType(t);
  const byGroup = (g: string) => (m: MatchData) => m.player_group === g;
  if (types.length && groups.length) {
    return types.flatMap(t => groups.map(g => ({
      label: `${t} · ${g}`,
      match: (m: MatchData) => byType(t)(m) && byGroup(g)(m),
    })));
  }
  if (types.length) return types.map(t => ({ label: t, match: byType(t) }));
  return groups.map(g => ({ label: g, match: byGroup(g) }));
}

// 지표별 막대 그리드 — 기준선(상단 필터 기준 평균)에 타입/그룹별 평균을 나란히 겹쳐 본다.
// baseMatches는 상단 경기 타입·연령 탭이 그대로 반영된 데이터, poolMatches는 비교하는
// 축의 상단 필터만 풀어 둔 데이터라 상단에서 뭘 골랐든 자유롭게 비교할 수 있다.
function PersonalCompareChart({ baseMatches, poolMatches, series, compareLabel }: {
  baseMatches: MatchData[]; poolMatches: MatchData[]; series: CompareSeries[]; compareLabel: string;
}) {
  return (
    <div className="chart-card mb-4">
      <div className="chart-title !mb-1">전체 지표 비교</div>
      <p className="text-[11px] text-text-secondary mb-3">
        상단 필터 기준 평균(회색) vs {compareLabel} 평균
      </p>
      <div className="grid grid-cols-5 gap-3">
        {MATCH_METRICS.map(m => {
          const data = [
            { name: '평균', value: +avgOf(baseMatches, m.key).toFixed(1) },
            ...series.map(s => ({ name: s.label, value: +avgOf(poolMatches.filter(s.match), m.key).toFixed(1) })),
          ];
          const maxVal = Math.max(...data.map(d => d.value), 1);
          return (
            <div key={m.key} className="flex flex-col items-center">
              <p className="text-xs font-semibold text-gray-600 mb-1">{m.label}</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data} margin={{ top: 20, right: 4, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} angle={-30} textAnchor="end" height={40} />
                  <YAxis domain={[0, Math.ceil(maxVal * 1.2)]} tick={{ fontSize: 8 }} width={36} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#9ca3af' : COMPARE_COLORS[(i - 1) % COMPARE_COLORS.length]} />
                    ))}
                    <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: '#374151' }} formatter={(v: RenderableText) => Number(v).toLocaleString()} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonalMatchTab({ matches }: { matches: MatchData[] }) {
  const [eventFilter, setEventFilter] = useState('전체');
  const [groupFilter, setGroupFilter] = useState('전체');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // "타입끼리 비교"/"그룹끼리 비교". 둘을 동시에 켜면 조합(타입 × 그룹)으로 비교한다
  // (팀 대시보드 Match 탭과 동일).
  const [compareTypes, setCompareTypes] = useState<string[]>([]);
  const [compareGroups, setCompareGroups] = useState<string[]>([]);
  const compareActive = compareTypes.length > 0 || compareGroups.length > 0;

  const eventTypes = ['전체'];
  const seenEventTypes = new Set<string>();
  for (const m of matches) {
    const norm = normalizeEventType(m.event_type);
    if (!seenEventTypes.has(norm)) { seenEventTypes.add(norm); eventTypes.push(m.event_type); }
  }
  const groups = ['전체', ...new Set(matches.map(m => m.player_group).filter((g): g is string => !!g))];

  const filteredMatches = matches.filter(m =>
    (eventFilter === '전체' || normalizeEventType(m.event_type) === normalizeEventType(eventFilter)) &&
    (groupFilter === '전체' || m.player_group === groupFilter),
  );

  // 비교 계열 후보 풀. 비교하는 축의 상단 필터만 무시한다(타입만 비교하면 연령 필터 유지,
  // 그룹만 비교하면 경기 타입 필터 유지, 둘 다 비교하면 둘 다 해제).
  const compareSeries = buildCompareSeries(compareTypes, compareGroups);
  const comparePool = compareTypes.length && compareGroups.length
    ? matches
    : compareTypes.length
    ? matches.filter(m => groupFilter === '전체' || m.player_group === groupFilter)
    : matches.filter(m => eventFilter === '전체' || normalizeEventType(m.event_type) === normalizeEventType(eventFilter));
  const compareLabel = compareTypes.length && compareGroups.length
    ? '타입·연령 조합별'
    : compareTypes.length ? '경기 타입별' : '경기 연령별';

  // 비교 경기 드롭다운은 필터된 목록에서 고르되, 실제 값은 그룹 필터와 무관하게 그 경기 원본 기록을 그대로 사용한다.
  const matchOptions = [...filteredMatches]
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
    .map(m => ({ key: `${m.match_date}__${m.opponent}`, label: `${m.opponent} (${m.match_date.slice(5)}) · ${m.event_type}` }));

  // 필터에 걸리는 경기가 없을 때 matches[0]으로 폴백하면 "평균 0m + 필터와 무관한 경기 값"이
  // 나란히 표시돼 잘못된 비교가 된다. 이 경우엔 아래에서 빈 상태를 보여준다.
  const lastRow = selectedKey === NO_COMPARISON
    ? null
    : selectedKey
    ? matches.find(m => `${m.match_date}__${m.opponent}` === selectedKey) ?? null
    : filteredMatches[0] ?? null;

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
      ...(lastRow ? { 선택경기: lastTd > 0 ? +((lastZone / lastTd) * 100).toFixed(1) : 0 } : {}),
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
            disabled={compareActive}
            className="text-xs border border-surface-secondary rounded-lg px-2 py-1 bg-surface disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="">최근 경기 (자동)</option>
            <option value={NO_COMPARISON}>없음</option>
            {matchOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span className="text-[11px] text-text-secondary">필터된 {filteredMatches.length}경기 평균 · 커리어 최고(Peak)는 전체 경기 기준</span>
        </div>

        {/* 경기 타입끼리 비교 — 여러 개 켜면 비교 경기 드롭다운 대신 이 모드로 전환된다 */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs font-semibold text-text-secondary w-16 shrink-0">타입 비교</span>
          {eventTypes.filter(et => et !== '전체').map(et => {
            const active = compareTypes.includes(et);
            const color = COMPARE_COLORS[compareTypes.indexOf(et) % COMPARE_COLORS.length];
            return (
              <button
                key={et}
                onClick={() => setCompareTypes(
                  compareTypes.includes(et) ? compareTypes.filter(t => t !== et) : [...compareTypes, et],
                )}
                style={active ? { background: color, color: '#fff' } : undefined}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {et}
              </button>
            );
          })}
          {compareTypes.length > 0 && (
            <button onClick={() => setCompareTypes([])} className="text-xs text-gray-400 underline">초기화</button>
          )}
        </div>

        {/* 그룹끼리 비교 — 타입 비교와 배타적 */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs font-semibold text-text-secondary w-16 shrink-0">그룹 비교</span>
          {groups.filter(g => g !== '전체').map(g => {
            const active = compareGroups.includes(g);
            const color = COMPARE_COLORS[compareGroups.indexOf(g) % COMPARE_COLORS.length];
            return (
              <button
                key={g}
                onClick={() => setCompareGroups(
                  compareGroups.includes(g) ? compareGroups.filter(x => x !== g) : [...compareGroups, g],
                )}
                style={active ? { background: color, color: '#fff' } : undefined}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {g}
              </button>
            );
          })}
          {compareGroups.length > 0 && (
            <button onClick={() => setCompareGroups([])} className="text-xs text-gray-400 underline">초기화</button>
          )}
        </div>
      </div>

      {filteredMatches.length === 0 ? (
        <div className="chart-card text-center text-text-secondary py-8">
          선택한 경기 타입·경기 연령 조합에 해당하는 이 선수의 경기 기록이 없습니다.
        </div>
      ) : compareActive ? (
        <PersonalCompareChart baseMatches={filteredMatches} poolMatches={comparePool} series={compareSeries} compareLabel={compareLabel} />
      ) : (
      <>
      <div className="grid grid-cols-5 gap-3 mb-4 stat-grid-4">
        {MATCH_METRICS.map(m => (
          <MetricCompareCard
            key={m.key}
            label={m.label}
            unit={m.unit}
            avgVal={avgOf(filteredMatches, m.key)}
            lastVal={lastRow ? Number(lastRow[m.key]) || 0 : null}
            peakVal={maxOf(matches, m.key)}
          />
        ))}
      </div>

      <div className="chart-card mb-4">
        <div className="chart-title">
          속도 구간(Zone) 분포 — {lastRow ? '평균 vs 선택 경기' : '평균'} (TD 대비 %)
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={zoneData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
            <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} formatter={(v: any) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="평균" fill="#153E6F99" radius={[3, 3, 0, 0]} />
            {lastRow && <Bar dataKey="선택경기" fill="#A42843" radius={[3, 3, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      </>
      )}

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

// ── Physical 탭 ────────────────────────────────────────────────────────
// 좌우 차이 % — VALD 표준: (큰 쪽 - 작은 쪽) / 큰 쪽 * 100
function imbalancePercent(l: number, r: number): number {
  const base = Math.max(l, r);
  return base > 0 ? ((r - l) / base) * 100 : 0;
}
// 11px 보조 텍스트에 쓰이는 색이라 colors.warning(#B08A00) 원색은 흰 바탕에서
// 3.24:1 로 AA 미달이다. 배지·존 색은 그대로 두고 이 텍스트만 5.02:1 로 내린다.
const IMBALANCE_WARN_TEXT = '#8A6B00';
function imbalanceColor(pct: number): string {
  const abs = Math.abs(pct);
  return abs >= 10 ? colors.danger : abs >= 5 ? IMBALANCE_WARN_TEXT : colors.safe;
}

function StatMiniCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-lg border border-surface-secondary p-3">
      <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: subColor ?? undefined }}>{sub}</p>}
    </div>
  );
}

// 체중/키 월별 추이 (인바디 세부 항목은 DB에 없어 growth_tracking의 키·체중만 시각화)
function BodyCompositionSection({ rows }: { rows: BodyCompositionRow[] }) {
  const sorted = [...rows].sort((a, b) => a.year - b.year || a.month - b.month);
  const chartData = sorted.map(r => ({ label: `${r.year}.${String(r.month).padStart(2, '0')}`, height: r.height, weight: r.weight }));
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  if (sorted.length === 0) {
    return <div className="chart-card text-center text-text-secondary py-8">체중·키 기록이 없습니다.</div>;
  }

  const delta = (key: 'height' | 'weight') => {
    if (!latest || !prev || latest[key] == null || prev[key] == null) return null;
    return +((latest[key]! - prev[key]!).toFixed(1));
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {([['weight', '체중', 'kg', colors.muted], ['height', '키', 'cm', colors.navy]] as const).map(([key, label, unit, color]) => {
        const d = delta(key);
        return (
          <div key={key} className="chart-card">
            <div className="flex items-baseline gap-2 mb-1">
              <div className="chart-title !mb-0">{label}</div>
              <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-data)' }}>{latest?.[key] ?? '—'}{unit}</span>
              {d != null && (
                <span className={`text-xs font-medium ${d >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {d >= 0 ? '▲' : '▼'}{Math.abs(d)}{unit}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} width={34} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} formatter={(v: any) => [`${v}${unit}`, label]} />
                <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

const MATURITY_STAGE_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  '성장 급증기 전': { label: 'Pre-PHV (성장 급증기 전)',  bg: '#E8EEF5', text: colors.navy },
  '성장 급증기':    { label: 'Mid-PHV (성장 급증기)',    bg: '#FFF6CC', text: '#8A6B00' },
  '성장 급증기 후': { label: 'Post-PHV (성장 급증기 후)', bg: '#E0F3F0', text: '#006D62' },
};

function MaturitySection({ row }: { row: MaturityRow | null }) {
  if (!row) {
    return <div className="chart-card text-center text-text-secondary py-8">신체 성숙도 기록이 없습니다.</div>;
  }
  const stage = row.maturity_stage ? MATURITY_STAGE_LABEL[row.maturity_stage] ?? { label: row.maturity_stage, bg: '#eee', text: '#666' } : null;
  return (
    <div className="chart-card">
      <div className="chart-title">신체 성숙도 (Khamis-Roche / Mirwald)</div>
      <div className="grid grid-cols-5 gap-3 stat-grid-4">
        <StatMiniCard label="현재 키" value={row.baseline_height_cm != null ? `${row.baseline_height_cm}cm` : '—'} />
        <StatMiniCard label="예측 성인 키" value={row.predicted_adult_height_cm != null ? `${row.predicted_adult_height_cm}cm` : '—'} />
        <StatMiniCard label="성장 도달률 (PAH%)" value={row.pah_percent != null ? `${row.pah_percent}%` : '—'} />
        <StatMiniCard label="APHV 도달 나이" value={row.mirwald_aphv_age != null ? `${row.mirwald_aphv_age}세` : '—'} />
        <div className="rounded-lg border border-surface-secondary p-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>성숙 단계</p>
          {stage ? (
            <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: stage.bg, color: stage.text }}>
              {stage.label}
            </span>
          ) : <p className="text-lg font-bold mt-1">—</p>}
        </div>
      </div>
    </div>
  );
}

// VALD 항목 중 좌우(L/R)가 있는 항목은 불균형 배지와 함께, 단일값 항목은 값만 표시
const VALD_LR_KEYS = ['nordic_curl', 'hip_abduction', 'hip_adduction', 'ham_iso'];
function ValdSection({ record }: { record: PhysicalTestRow | null }) {
  if (!record) {
    return <div className="chart-card text-center text-text-secondary py-8">VALD 측정 기록이 없습니다.</div>;
  }
  return (
    <div className="chart-card">
      <div className="chart-title">VALD 측정 ({record.test_date})</div>
      <div className="grid grid-cols-4 gap-3 stat-grid-4">
        {VALD_METRIC_DEFS.map(m => {
          const acc = VALD_ACCESSORS[m.key];
          if (VALD_LR_KEYS.includes(m.key) && acc.left && acc.right) {
            const l = acc.left(record);
            const r = acc.right(record);
            if (l == null || r == null) return null;
            const imb = imbalancePercent(l, r);
            return (
              <StatMiniCard key={m.key} label={m.label} value={`${l.toFixed(1)} / ${r.toFixed(1)} ${m.unit}`}
                sub={`좌우 불균형 ${imb.toFixed(1)}%`} subColor={imbalanceColor(imb)} />
            );
          }
          const val = computeValdValue(m.key, record);
          if (val == null) return null;
          return (
            <StatMiniCard key={m.key} label={m.label} value={`${val.toFixed(m.unit === 'sec' ? 3 : m.key === 'eur' ? 2 : 1)}${m.unit}`} />
          );
        })}
      </div>
    </div>
  );
}

// VALD 차수별 추이. 종목마다 측정된 차수가 달라서(ham_iso 는 26_1 부터, cod_run 은 빠진 차수가 있다)
// 그 선수에게 값이 2개 차수 이상 있는 종목만 그린다 — 점 하나짜리 빈 차트를 14개 늘어놓지 않기 위해서다.
// 좌우가 있는 종목은 한 차트에 두 선으로 겹쳐 불균형이 시간에 따라 어떻게 변하는지 같이 보이게 한다.
// Y축을 데이터 범위로만 잡으면(auto) 임계 라인이 축 밖으로 밀려 차트에 안 보인다.
// 데이터와 임계치를 모두 담되, 눈금이 지저분해지지 않도록 자릿수에 맞춘 경계로 끊는다.
function niceDomain(lo: number, hi: number): [number, number] {
  if (!(hi > lo)) { const d = Math.abs(hi || 1) * 0.1; return [+(hi - d).toFixed(4), +(hi + d).toFixed(4)]; }
  const span = hi - lo;
  const step = Math.pow(10, Math.floor(Math.log10(span))) / 2;
  const pad = span * 0.08;
  return [+(Math.floor((lo - pad) / step) * step).toFixed(4), +(Math.ceil((hi + pad) / step) * step).toFixed(4)];
}

function ValdTrendSection({ history, thresholds }: {
  history: PhysicalTestRow[]; thresholds: ValdThreshold[];
}) {
  // 임계치는 항목별 '전체' 값을 쓴다. 학년별 값은 좌우 평균 기준이라 좌/우를 각각 그리는
  // 이 차트와 축이 맞지 않아 구간이 바닥에 눌렸다.
  const thresholdFor = (key: string) =>
    thresholds.find(x => x.metric_key === key && x.grade === '전체') ?? null;
  // 차수 라벨이 있는 측정만, 오름차순으로 (차수 없는 2025 행은 VALD 값이 아예 없다)
  const rounds = [...history]
    .filter(r => r.test_round != null)
    .sort((a, b) => a.test_date.localeCompare(b.test_date));

  const charts = VALD_METRIC_DEFS.map(def => {
    const acc = VALD_ACCESSORS[def.key];
    const isLR = VALD_LR_KEYS.includes(def.key) && acc?.left && acc?.right;
    const data = rounds.map(r => ({
      label: r.test_round as string,
      left: isLR ? acc.left!(r) : null,
      right: isLR ? acc.right!(r) : null,
      value: isLR ? null : computeValdValue(def.key, r),
    }));
    const count = isLR
      ? data.filter(d => d.left != null || d.right != null).length
      : data.filter(d => d.value != null).length;
    return { def, data, isLR, count, th: thresholdFor(def.key) };
  }).filter(c => c.count >= 2);

  if (charts.length === 0) return null;

  const digits = (unit: string, key: string) => unit === 'sec' ? 3 : key === 'eur' ? 2 : 1;

  return (
    <div className="chart-card">
      <div className="chart-title">VALD 차수별 추이</div>
      <p className="text-[11px] text-text-secondary mb-3">
        2개 차수 이상 측정된 종목만 표시합니다. 좌우 측정 종목은 한 차트에 겹쳐 그려 불균형 변화를 함께 봅니다.
        태그가 붙은 항목의 최대·최저선은 팀 값이 아닙니다 —
        또래 = {THRESHOLD_SOURCE_NOTE['또래']}, K리그 = {THRESHOLD_SOURCE_NOTE['K리그']}.
      </p>
      <p className="text-[11px] text-text-secondary mb-3 flex gap-3 flex-wrap items-center">
        {([['최대', colors.green], ['평균', colors.navy], ['최저', colors.wine]] as const).map(([label, c]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block" style={{ background: c }} />
            {label}
          </span>
        ))}
        <span className="text-text-secondary">· 항목별 전체 기준 · 데이터 관리 &gt; 피지컬 데이터에서 설정</span>
      </p>
      <div className="grid grid-cols-3 gap-3 stat-grid-4">
        {charts.map(({ def, data, isLR, th }) => {
          const nums = data.flatMap(d => isLR ? [d.left, d.right] : [d.value]).filter((v): v is number => v != null);
          const last = nums[nums.length - 1];
          // 축은 측정값과 임계 3선을 모두 포함해야 한다. 하나라도 빠지면 그 선이 안 보인다.
          const axisVals = [...nums, th?.min_value, th?.avg_value, th?.max_value]
            .filter((v): v is number => v != null);
          const domain = axisVals.length ? niceDomain(Math.min(...axisVals), Math.max(...axisVals)) : undefined;
          return (
            <div key={def.key} className="rounded-lg border border-surface-secondary p-2.5">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[11px] font-medium truncate">{def.label}</span>
                {THRESHOLD_SOURCE[def.key] && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-surface-secondary text-text-secondary flex-shrink-0">
                    {THRESHOLD_SOURCE[def.key]}
                  </span>
                )}
                <span className="text-sm font-bold ml-auto" style={{ fontFamily: 'var(--font-data)' }}>
                  {last != null ? `${last.toFixed(digits(def.unit, def.key))}${def.unit}` : '—'}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} domain={domain ?? ['auto', 'auto']} allowDataOverflow={false} width={38} />
                  <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
                  {th?.max_value != null && (
                    <ReferenceLine y={th.max_value} stroke={colors.green} strokeWidth={1} strokeDasharray="4 3" />
                  )}
                  {th?.avg_value != null && (
                    <ReferenceLine y={th.avg_value} stroke={colors.navy} strokeWidth={1} strokeDasharray="4 3" />
                  )}
                  {th?.min_value != null && (
                    <ReferenceLine y={th.min_value} stroke={colors.wine} strokeWidth={1} strokeDasharray="4 3" />
                  )}
                  {isLR ? (
                    <>
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="left" name="좌" stroke={colors.navy} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                      <Line type="monotone" dataKey="right" name="우" stroke={colors.danger} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                    </>
                  ) : (
                    <Line type="monotone" dataKey="value" name={def.label} stroke={colors.green} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpeedCustomSection({ row, history }: { row: SpeedCustomRow | null; history: SpeedCustomTestRow[] }) {
  // 차수별 추이는 오름차순으로 본다(표·차트 모두 1차 → 최신 순).
  const rounds = [...history].sort((a, b) => a.test_date.localeCompare(b.test_date));
  const chartData = rounds.map(r => ({
    label: r.test_round ?? r.test_date.slice(5),
    mas: r.mas,
    mss: r.mss,
  }));
  const delta = (key: 'mas' | 'mss') => {
    const vals = rounds.map(r => r[key]).filter((v): v is number => v != null);
    if (vals.length < 2) return null;
    return +(vals[vals.length - 1] - vals[vals.length - 2]).toFixed(1);
  };

  if (!row && rounds.length === 0) {
    return <div className="chart-card text-center text-text-secondary py-8">Speed custom 기록이 없습니다.</div>;
  }

  return (
    <div className="space-y-4">
      {row && (
        <div className="chart-card">
          <div className="chart-title">Speed Custom (역대 최고 MAS/MSS 기준 훈련 Zone)</div>
          <div className="grid grid-cols-4 gap-3 mb-3 stat-grid-4">
            <StatMiniCard label="MAS" value={`${row.mas}km/h`} />
            <StatMiniCard label="MSS" value={`${row.mss}km/h`} />
            <StatMiniCard label="Zone1 (MAS 60%)" value={`${row.zone1_mas60}km/h`} />
            <StatMiniCard label="Zone2 (MAS 80%)" value={`${row.zone2_mas80}km/h`} />
          </div>
          <div className="grid grid-cols-3 gap-3 stat-grid-4">
            <StatMiniCard label="Zone3 (MAS 100%)" value={`${row.zone3_mas100}km/h`} />
            <StatMiniCard label="Zone4 (ASR 20%)" value={`${row.zone4_asr20}km/h`} />
            <StatMiniCard label="Zone5 (MSS 80%)" value={`${row.zone5_mss80}km/h`} />
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {([['mas', 'MAS', colors.green], ['mss', 'MSS', colors.danger]] as const).map(([key, label, color]) => {
            const d = delta(key);
            const latest = [...rounds].reverse().find(r => r[key] != null)?.[key] ?? null;
            return (
              <div key={key} className="chart-card">
                <div className="flex items-baseline gap-2 mb-1">
                  <div className="chart-title !mb-0">{label} 차수별</div>
                  <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-data)' }}>
                    {latest != null ? `${latest}km/h` : '—'}
                  </span>
                  {d != null && (
                    <span className={`text-xs font-medium ${d >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {d >= 0 ? '▲' : '▼'}{Math.abs(d)}
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} width={34} />
                    <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
                    <Line type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 팀 대시보드 InsightBox 패턴을 참고해 VALD 불균형·EUR·성숙 단계·Speed를 종합한 개인 인사이트 문구 생성
const MAS_TIERS: { label: string; max: number }[] = [
  { label: '매우 낮음', max: 11.5 },
  { label: '낮음', max: 12.5 },
  { label: '보통', max: 13.5 },
  { label: '우수', max: 15.0 },
  { label: '매우 우수', max: 16.5 },
  { label: '엘리트', max: Infinity },
];
function classifyMAS(v: number): string {
  return (MAS_TIERS.find(t => v <= t.max) ?? MAS_TIERS[MAS_TIERS.length - 1]).label;
}

// ── 피지컬 프로필 레이더 차트 (Strength/Power/Speed/Agility/Balance) ──────
// 데이터 관리에서 입력한 학년별 임계값(vald_thresholds)의 최저~최고 구간을 0~100점으로 환산해 사용한다.
// K리그 유소년 피지컬 측정 OT(2026.04.27) p.14 의 공식 컴포넌트 구성이다.
// BODY PROFILE 은 축이 아니라 별도 섹션이고, 좌우 비대칭은 축이 아니라 신호등(정상/주의/
// 위험)으로 부상 예방 섹션에서만 다룬다 — 같은 자료 p.37·38 의 운영 방식이다.
// 스프린트 누적 기록(5·10·30m)은 축으로 쓰지 않는다. 0~30m 는 가속 구간이 섞여 있어
// 최고속도 지표가 못 되고, 누적 기록끼리는 서로 겹쳐 한 축에 평균하면 같은 구간을 여러 번
// 세게 된다. VALD 측정값 표에서 또래 규준과 함께 그대로 보고한다.
// 축에는 거기서 파생한 10~30m 플라잉만 쓴다 — 가속 구간을 뺀 순수 최고속도다.
// SPEED(10~30m·MSS)와 ENDURANCE(MAS)는 공식 16개 프로토콜 밖이라 참고 축이다.
type RadarAxisKey = 'strength' | 'power' | 'speed' | 'agility' | 'endurance';
const RADAR_AXES: { key: RadarAxisKey; ko: string; en: string }[] = [
  { key: 'strength', ko: '근력', en: 'Strength' },
  { key: 'power', ko: '순발력', en: 'Power' },
  { key: 'speed', ko: '최고속도', en: 'Speed' },
  { key: 'agility', ko: '민첩성', en: 'Agility' },
  { key: 'endurance', ko: '지구력', en: 'Endurance' },
];
const STRENGTH_METRIC_KEYS = ['nordic_curl', 'hip_abduction', 'hip_adduction', 'ham_iso'];
const POWER_METRIC_KEYS = ['cmj_height', 'squat_jump_height'];
// 최고속도 축 = 10~30m 플라잉(physical_report 파생) + MSS(speed_custom_test). 둘 다 팀 내부
// 기준이고 서로 r=0.93 이다. MSS 는 테이블이 달라 레코드 루프 밖에서 더한다.
const AGILITY_METRIC_KEYS = ['cod_run', 'cod_ball'];

// speed_custom_test 에서 항목별로 값이 있는 가장 최근 차수를 쓴다 — 레이더의 다른 축이
// '가장 최근 측정 가능한 회차'를 쓰는 것과 같은 규칙이다(역대 최고가 아니다).
export interface SpeedAxisVals { mas: number | null; mss: number | null; date: string | null }
function latestSpeedVals(rows: SpeedCustomTestRow[]): SpeedAxisVals {
  const byDate = [...rows].sort((a, b) => b.test_date.localeCompare(a.test_date));
  const mas = byDate.find(r => r.mas != null) ?? null;
  const mss = byDate.find(r => r.mss != null) ?? null;
  return { mas: mas?.mas ?? null, mss: mss?.mss ?? null, date: mas?.test_date ?? mss?.test_date ?? null };
}

// 점수는 팀 전체(`전체`) 임계값으로만 낸다. 학년별 임계는 표본이 6~16명이라
// 최소~최대를 그 학년에서 뽑으면 학년 최하위가 자동으로 0점, 최상위가 100점이 되어
// 점수가 '능력 수준'이 아니라 '학년 내 순위'가 된다. 학년 임계값은 데이터 관리 화면의
// 참고용으로 남겨둔다.
const SCORE_THRESHOLD_GRADE = '전체';

// 임계값 출처. 기본은 팀 실측이고 아래 항목만 외부 기준을 쓴다.
const THRESHOLD_SOURCE: Record<string, '또래' | 'K리그'> = {
  sprint_5m: '또래', sprint_10m: '또래', sprint_30m: '또래',
  nordic_curl: 'K리그', eur: 'K리그',
};
const THRESHOLD_SOURCE_NOTE: Record<'또래' | 'K리그', string> = {
  '또래': '또래 기준 (12~16세 아카데미 백분위 P10~P90 · PMC11751035)',
  'K리그': 'K리그 유소년 피지컬 측정 OT 공식 기준 (2026.04.27)',
};

// EUR 은 높을수록 좋은 지표가 아니다. K리그 OT 는 1.10~1.15 를 적정 구간으로 본다
// (1.10 미만 = 폭발적 힘 훈련 필요 / 1.15 초과 = 최대근력 훈련 필요).
// 선형 점수를 쓰면 1.55 가 100점, 적정값 1.12 가 14점이 되어 메시지가 거꾸로 나갔다.
const EUR_BAND: readonly [number, number] = [1.10, 1.15];
// 5단계 등급('매우 우수'~'보완 필요')은 밴드형 지표에 안 맞는다. 1.25 를 '우수'로 쓰면
// OT 의 '1.15 이상 = 최대근력 훈련 필요'와 정반대 메시지가 된다. EUR 만 판정문으로 쓴다.
function eurVerdict(v: number | null): { text: string; color: string } | null {
  if (v == null) return null;
  const [lo, hi] = EUR_BAND;
  if (v < lo) return { text: '탄성 훈련 필요', color: '#8A6B00' };
  if (v > hi) return { text: '최대근력 훈련 필요', color: '#8A6B00' };
  return { text: '적정', color: '#008C7E' };
}

function scoreForMetric(metricKey: string, value: number | null, thresholds: ValdThreshold[]): number | null {
  if (value == null) return null;
  const t = thresholds.find(x => x.metric_key === metricKey && x.grade === SCORE_THRESHOLD_GRADE);
  if (!t || t.min_value == null || t.max_value == null || t.max_value === t.min_value) return null;
  if (metricKey === 'eur') {
    const [lo, hi] = EUR_BAND;
    if (value >= lo && value <= hi) return 100;
    const span = value < lo ? lo - t.min_value : t.max_value - hi;
    if (span <= 0) return value < lo ? 0 : 0;
    const ratio = value < lo ? (value - t.min_value) / span : (t.max_value - value) / span;
    return Math.max(0, Math.min(100, ratio * 100));
  }
  const def = VALD_METRIC_DEFS.find(d => d.key === metricKey);
  const ratio = def?.invert
    ? (t.max_value - value) / (t.max_value - t.min_value)
    : (value - t.min_value) / (t.max_value - t.min_value);
  return Math.max(0, Math.min(100, ratio * 100));
}

function avgOfScores(scores: (number | null)[]): number | null {
  const t = scores.filter((s): s is number => s != null);
  if (t.length === 0) return null;
  return t.reduce((a, b) => a + b, 0) / t.length;
}

// 항목별로 값이 있는 가장 최근 회차를 쓴다. 예전에는 축 단위로 찾아서, 최신 회차에
// cod_ball 만 있으면 축이 이미 계산 가능해져 이전 회차의 cod_run 이 영영 안 쓰였다(23명).
type ScoredItem = { score: number | null; date: string | null };
function latestMetricScore(key: string, history: PhysicalTestRow[], thresholds: ValdThreshold[]): ScoredItem {
  for (const r of history) {
    const v = computeValdValue(key, r);
    if (v == null) continue;
    return { score: scoreForMetric(key, v, thresholds), date: r.test_date };
  }
  return { score: null, date: null };
}

const AXIS_METRIC_KEYS: Record<RadarAxisKey, string[]> = {
  strength: STRENGTH_METRIC_KEYS,
  power: POWER_METRIC_KEYS,
  speed: ['fly_10_30'],   // MSS 는 아래에서 따로 더한다
  agility: AGILITY_METRIC_KEYS,
  endurance: [],  // MAS 는 아래에서 따로 더한다
};

// history 는 최신순 정렬을 전제로 한다. dates 에는 그 축에 기여한 항목 중 가장 오래된
// 측정일을 남긴다 — 한 항목이라도 이전 회차에서 끌어왔으면 화면에 밝혀야 한다.
function computeRadarScores(
  history: PhysicalTestRow[], thresholds: ValdThreshold[], speedVals?: SpeedAxisVals,
): {
  scores: Record<RadarAxisKey, number | null>;
  dates: Record<RadarAxisKey, string | null>;
} {
  const scores = {} as Record<RadarAxisKey, number | null>;
  const dates = {} as Record<RadarAxisKey, string | null>;
  for (const a of RADAR_AXES) {
    const items: ScoredItem[] = AXIS_METRIC_KEYS[a.key].map(k => latestMetricScore(k, history, thresholds));
    // MAS·MSS 는 physical_report 가 아니라 speed_custom_test 에 있어 회차 루프 밖에서 더한다.
    if (a.key === 'speed') {
      items.push({ score: scoreForMetric('mss', speedVals?.mss ?? null, thresholds), date: speedVals?.date ?? null });
    }
    if (a.key === 'endurance') {
      items.push({ score: scoreForMetric('mas', speedVals?.mas ?? null, thresholds), date: speedVals?.date ?? null });
    }
    const used = items.filter(i => i.score != null);
    scores[a.key] = avgOfScores(used.map(i => i.score));
    const ds = used.map(i => i.date).filter((d): d is string => d != null).sort();
    dates[a.key] = ds[0] ?? null;
  }
  return { scores, dates };
}

function findWorstImbalance(record: PhysicalTestRow | null): { key: string; label: string; imbalance: number } | null {
  if (!record) return null;
  let worst: { key: string; label: string; imbalance: number } | null = null;
  for (const key of STRENGTH_METRIC_KEYS) {
    const acc = VALD_ACCESSORS[key];
    const def = VALD_METRIC_DEFS.find(d => d.key === key);
    if (!acc.left || !acc.right || !def) continue;
    const l = acc.left(record);
    const r = acc.right(record);
    if (l == null || r == null) continue;
    const imb = Math.abs(imbalancePercent(l, r));
    if (!worst || imb > worst.imbalance) worst = { key, label: def.label, imbalance: imb };
  }
  return worst;
}

const RADAR_PRESCRIPTION: Record<RadarAxisKey, { title: string; text: string }> = {
  strength: { title: '근력 (Strength) 보완', text: '팀 평균 대비 근력(Nordic Curl·Hip Ab/Add·Ham Iso)이 낮습니다. 하체·고관절 근력 강화 훈련이 필요합니다.' },
  power: { title: '순발력 (Power) 보완', text: '팀 평균 대비 순발력(CMJ·Squat Jump)이 낮습니다. 플라이오메트릭·폭발적 근력 훈련이 필요합니다.' },
  speed: { title: '최고속도 (Speed) 보완', text: '팀 평균 대비 최고속도(10~30m 플라잉 · MSS)가 낮습니다. 가속 구간 기술과 최고 속도 구간 노출을 함께 늘릴 필요가 있습니다.' },
  agility: { title: '민첩성 (Agility) 보완', text: '팀 평균 대비 민첩성(방향전환)이 낮습니다. 방향전환 기술과 감속 능력 훈련이 필요합니다.' },
  endurance: { title: '지구력 (Endurance) 보완', text: '팀 평균 대비 지구력(MAS, 최대 유산소 속도)이 낮습니다. MAS 기반 인터벌로 유산소 기저를 올릴 필요가 있습니다.' },
};

const RADAR_REINFORCE_EXERCISES: Record<RadarAxisKey, { name: string; note: string; sets: string; reps: string; intensity: string; purpose: string }[]> = {
  strength: [
    { name: 'Nordic Hamstring Curl', note: '햄스트링 근력', sets: '3세트', reps: '6~8회', intensity: '중강도', purpose: '햄스트링 편심성 근력 보강 목적' },
    { name: 'Copenhagen Plank', note: '내전근·고관절', sets: '3세트', reps: '20~30초 × 좌우', intensity: '중강도', purpose: '고관절 내전·외전근 보강 목적' },
    { name: 'Bulgarian Split Squat', note: '하체 편측 근력', sets: '3세트', reps: '8회 × 좌우', intensity: '중~고강도, 덤벨 병행 가능', purpose: '편측 하체 근력 보강 목적' },
  ],
  power: [
    { name: 'Depth Jump', note: '반응 파워', sets: '3세트', reps: '5회', intensity: '고강도', purpose: '착지 후 폭발적 반응력 보강 목적' },
    { name: 'Box Jump', note: '수직 파워', sets: '4세트', reps: '5회', intensity: '고강도', purpose: '수직 점프 파워 보강 목적' },
    { name: 'Squat Jump (부하)', note: '최대근력 기반 파워', sets: '3세트', reps: '6회', intensity: '중~고강도', purpose: 'EUR 개선 및 최대근력 훈련 목적' },
  ],
  speed: [
    { name: 'Flying Sprint', note: '최고 속도 구간', sets: '3세트', reps: '20m(가속 후) × 3회', intensity: '최대강도', purpose: '최고 속도 구간 노출 목적' },
    { name: '다운힐 스프린트', note: '초최대 속도', sets: '3세트', reps: '30m × 3회', intensity: '최대강도', purpose: '최고 속도 신경계 자극 목적' },
    { name: '롱 스프린트 (40~60m)', note: '속도 유지', sets: '4세트', reps: '40m × 4회', intensity: '최대강도', purpose: '최고 속도 유지 능력 보강 목적' },
  ],
  agility: [
    { name: '방향전환 래더 드릴', note: '민첩성·무게중심 제어', sets: '4세트', reps: '10초', intensity: '중강도', purpose: '방향전환 반응 속도 보강 목적' },
    { name: '5-10-5 Pro Agility Drill', note: '급가속·급감속', sets: '4세트', reps: '1회 × 좌우', intensity: '고강도', purpose: '방향전환 민첩성 보강 목적' },
    { name: 'Reactive Cone Drill (볼 포함)', note: '경기 상황 민첩성', sets: '3세트', reps: '30초', intensity: '중~고강도', purpose: '볼 소유 상황 방향전환 보강 목적' },
  ],
  endurance: [
    { name: 'MAS 인터벌 (30-15)', note: 'MAS 100~120% 구간', sets: '3세트', reps: '30초 달리기 / 15초 휴식 × 8회', intensity: '고강도', purpose: '최대 유산소 속도 보강 목적' },
    { name: '4분 인터벌', note: 'MAS 90~95% 구간', sets: '4세트', reps: '4분 / 3분 휴식', intensity: '중~고강도', purpose: '유산소 기저 보강 목적' },
    { name: '반복 스프린트 (RSA)', note: 'Zone4 이상 반복', sets: '3세트', reps: '20m × 6회 / 20초 휴식', intensity: '고강도', purpose: '반복 고강도 러닝 회복력 보강 목적' },
  ],
};

const RADAR_INJURY_EXERCISES: Record<string, { name: string; note: string; sets: string; reps: string; intensity: string; purpose: string }[]> = {
  hip_abduction: [
    { name: 'Side-lying Hip Abduction', note: '고관절 외전근(약한 쪽 우선)', sets: '3세트', reps: '12~15회', intensity: '저강도, 밴드 저항 추가 가능', purpose: 'Hip Abduction 좌우 불균형 완화 목적' },
    { name: 'Lateral Band Walk', note: '고관절·둔근', sets: '3세트', reps: '10걸음 × 좌우', intensity: '중강도', purpose: 'Hip Abduction 좌우 불균형 완화 목적' },
  ],
  hip_adduction: [
    { name: 'Copenhagen Plank', note: '내전근(약한 쪽 우선)', sets: '3세트', reps: '20~30초 × 좌우', intensity: '중강도', purpose: 'Hip Adduction 좌우 불균형 완화 목적' },
    { name: 'Adductor Squeeze', note: '내전근', sets: '3세트', reps: '10회 × 8초 유지', intensity: '저~중강도', purpose: 'Hip Adduction 좌우 불균형 완화 목적' },
  ],
  nordic_curl: [
    { name: 'Nordic Hamstring Curl (편측 강조)', note: '햄스트링(약한 쪽 우선)', sets: '3세트', reps: '6회 × 좌우', intensity: '중강도', purpose: 'Nordic Curl 좌우 불균형 완화 목적' },
    { name: 'Single-leg RDL', note: '햄스트링·밸런스', sets: '3세트', reps: '8회 × 좌우', intensity: '저~중강도', purpose: 'Nordic Curl 좌우 불균형 완화 목적' },
  ],
  ham_iso: [
    { name: 'Hamstring Iso Prone Hold (편측 강조)', note: '햄스트링 등척성(약한 쪽 우선)', sets: '3세트', reps: '20~30초 × 좌우', intensity: '중강도', purpose: 'Ham Iso 좌우 불균형 완화 목적' },
    { name: 'Nordic Hamstring Curl', note: '햄스트링', sets: '3세트', reps: '6회', intensity: '중강도', purpose: 'Ham Iso 좌우 불균형 완화 목적' },
  ],
};

const FIFA11_EXERCISE = { name: 'FIFA 11+ 스타일 워밍업', note: '전신(하체 중심)', sets: '1세트', reps: '15~20분', intensity: '저강도, 훈련 전 필수 루틴', purpose: '전반적 부상 예방 목적' };

function PhysicalRadarSection({ record, history, thresholds, teamScores, playerName, speedVals }: {
  record: PhysicalTestRow | null;
  history: PhysicalTestRow[];
  thresholds: ValdThreshold[];
  teamScores: Record<RadarAxisKey, number | null>[];
  playerName: string;
  speedVals: SpeedAxisVals;
}) {
  if (!record) {
    return <div className="chart-card text-center text-text-secondary py-8">피지컬 데이터가 없어 프로필을 표시할 수 없습니다.</div>;
  }

  const { scores, dates } = computeRadarScores(history, thresholds, speedVals);
  const teamAvg = Object.fromEntries(
    RADAR_AXES.map(a => {
      const vals = teamScores.map(s => s[a.key]).filter((v): v is number => v != null);
      return [a.key, vals.length > 0 ? vals.reduce((x, y) => x + y, 0) / vals.length : null];
    }),
  ) as Record<RadarAxisKey, number | null>;

  const chartData = RADAR_AXES.map(a => ({
    subject: a.en,
    개인: scores[a.key] != null ? +scores[a.key]!.toFixed(0) : 0,
    팀평균: teamAvg[a.key] != null ? +teamAvg[a.key]!.toFixed(0) : 0,
  }));

  const validAxes = RADAR_AXES.filter(a => scores[a.key] != null);
  // 어느 항목이 이전 회차에서 채워졌는지 밝혀야 측정일이 섞인 그래프를 오해하지 않는다.
  const carriedOver = RADAR_AXES.filter(a => dates[a.key] != null && dates[a.key] !== record.test_date);
  const best = [...validAxes].sort((a, b) => scores[b.key]! - scores[a.key]!)[0] ?? null;
  const worst = [...validAxes].sort((a, b) => scores[a.key]! - scores[b.key]!)[0] ?? null;

  const diffText = (axis: typeof RADAR_AXES[number]) => {
    const s = scores[axis.key]!;
    const avg = teamAvg[axis.key];
    if (avg == null) return '';
    const diff = Math.round(s - avg);
    return diff === 0 ? '팀 평균과 동일' : `팀 평균보다 ${Math.abs(diff)}점 ${diff > 0 ? '높음' : '낮음'}`;
  };

  // 팀 평균 대비 격차가 가장 큰(더 낮은) 항목을 처방 우선순위로 선정 (절대 최저점과 다를 수 있음)
  const relativeWorst = [...validAxes]
    .filter(a => teamAvg[a.key] != null)
    .sort((a, b) => (scores[a.key]! - teamAvg[a.key]!) - (scores[b.key]! - teamAvg[b.key]!))[0] ?? worst;

  const worstImbalance = findWorstImbalance(record);

  return (
    <div className="chart-card">
      <div className="chart-title">피지컬 프로필 ({RADAR_AXES.map(a => a.en.toUpperCase()).join(' · ')})</div>
      <p className="text-[11px] text-text-secondary mb-3">
        STRENGTH·POWER·AGILITY 는 K리그 유소년 측정 OT(2026.04.27) p.14 의 공식 컴포넌트입니다.
        SPEED(10~30m 플라잉 · MSS)와 ENDURANCE(MAS)는 공식 16개 프로토콜 밖이라 참고 축이고,
        팀 내부 기준으로 점수를 냅니다. 스프린트 누적 기록(5·10·30m)은 축에 넣지 않고
        아래 VALD 측정값에서 또래 규준과 함께 봅니다.
        좌우 비대칭은 축이 아니라 아래 부상 예방 항목에서 신호등으로 봅니다.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={chartData}>
              <PolarGrid stroke={chartColors.grid} />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar name="개인" dataKey="개인" stroke={colors.danger} fill={colors.danger} fillOpacity={0.35} />
              <Radar name="팀 평균" dataKey="팀평균" stroke={colors.navy} fill={colors.navy} fillOpacity={0.08} strokeDasharray="4 3" />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-5 gap-2 stat-grid-4 mt-1">
            {RADAR_AXES.map(a => (
              <div key={a.key} className="text-center">
                <p className="text-[10px] text-text-secondary" style={{ fontFamily: 'var(--font-data)' }}>{a.en}</p>
                <p className="text-lg font-bold" style={{ color: colors.danger }}>{scores[a.key] != null ? Math.round(scores[a.key]!) : '—'}</p>
              </div>
            ))}
          </div>
          {carriedOver.length > 0 && (
            <p className="text-[10px] text-text-secondary mt-2 text-center">
              최신 측정({record.test_date})에 값이 없어 이전 측정값 사용:{' '}
              {carriedOver.map(a => `${a.en} ${dates[a.key]}`).join(' · ')}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-surface-secondary p-3">
            <div className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-1">차트 해석</div>
            {best && worst ? (
              <p className="text-sm">
                {playerName} 선수는 {validAxes.length}개 항목 중 {best.ko}({best.en})가 {Math.round(scores[best.key]!)}점으로 가장 강점이며({diffText(best)}),
                {' '}{worst.ko}({worst.en})가 {Math.round(scores[worst.key]!)}점으로 상대적으로 보완이 필요합니다({diffText(worst)}).
              </p>
            ) : (
              <p className="text-sm text-text-secondary">임계값(데이터 관리)이 입력되지 않아 점수를 계산할 수 없습니다.</p>
            )}
          </div>

          {relativeWorst && (
            <div className="rounded-lg border border-surface-secondary p-3">
              <div className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-1">운동 처방</div>
              <p className="text-sm font-bold mb-1">{RADAR_PRESCRIPTION[relativeWorst.key].title}</p>
              <p className="text-sm">{RADAR_PRESCRIPTION[relativeWorst.key].text}</p>
            </div>
          )}

          <div className={`rounded-lg border p-3 ${worstImbalance && worstImbalance.imbalance >= 10 ? 'border-red-200 bg-red-50' : 'border-surface-secondary'}`}>
            {/* 붉은 틴트 배경(#FDF4F6) 위라 text-secondary 는 2.98:1 로 AA 미달이다. */}
            <div className="text-xs font-bold text-text-primary uppercase tracking-wide mb-1">부상 예방</div>
            {worstImbalance && worstImbalance.imbalance >= 10 ? (
              <p className="text-sm text-red-700">
                {worstImbalance.label} 좌우 불균형이 {worstImbalance.imbalance.toFixed(1)}%로 부상 위험 기준(10%)을 넘습니다 —
                방향전환 시 무게중심 제어와 편측 부상(햄스트링·서혜부) 위험이 높아질 수 있어 편측 보강 훈련을 우선하세요.
              </p>
            ) : (
              <p className="text-sm text-text-secondary">✅ 좌우 불균형이 안정적인 범위입니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExerciseItem({ ex }: { ex: { name: string; note: string; sets: string; reps: string; intensity: string; purpose: string } }) {
  return (
    <div className="rounded-lg border border-surface-secondary p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-sm font-bold">{ex.name}</span>
        <span className="text-[11px] text-text-secondary whitespace-nowrap">{ex.note}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-secondary">{ex.sets}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-secondary">{ex.reps}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-secondary">{ex.intensity}</span>
      </div>
      <p className="text-[12px] text-text-secondary">{ex.purpose}</p>
    </div>
  );
}

// ── 운동 처방 (발견 + 처방 통합) ─────────────────────────────────────────
// 예전엔 「AI 운동 처방」(운동만)과 「운동 처방 솔루션 및 인사이트」(수치만)가 따로 있어,
// "Nordic 18% 불균형"과 "Nordic Curl 하세요"를 코치가 머릿속으로 이어야 했다.
// 여기서는 발견 하나에 그 근거와 처방을 함께 붙이고 위험도 순으로 세운다.
//
// 임계값 근거 — 문헌이 뒷받침하는 만큼만 단정한다:
// · 좌우 비대칭 10%: 복귀 판정·모니터링 기준으로 널리 쓰이지만 부상 '예측' 근거는 약하다
//   (Bishop et al. 2018 체계적 고찰: 10~15% 역치가 근거 없이 인용되는 경우가 많음.
//    Green et al. 2018 메타분석: 비대칭 자체의 햄스트링 부상 예측력은 제한적).
//   그래서 '부상 위험 높음'이 아니라 '모니터링 기준 초과'로 적는다.
// · Nordic Hamstring: 비대칭과 달리 '예방' 근거는 강하다
//   (Al Attar et al. 2017 메타분석: NHE 포함 프로그램이 햄스트링 부상 51% 감소, IRR 0.49).
// · Copenhagen adduction: Harøy et al. 2017 — 엘리트 U19 에서 편심성 고관절 내전근력 향상
//   (부상 발생률이 아니라 근력 결과). FIFA 11+ 와 함께 서혜부 부상 위험 감소 보고.
// · EUR: McGuigan et al. 2006 이 제안한 SSC 지표지만 타당성 논란이 있다
//   (Kozinc et al. 2021 "Questionable Utility of the EUR"; 높은 EUR 이 좋은 탄성보다
//    나쁜 SJ 를 뜻할 수 있음). 처방 근거가 아니라 참고 수치로만 둔다.
// · 성숙 단계: Lloyd & Oliver 2012 YPD 모델 — 단계가 처방 강도의 전제라 맨 위에 둔다.
type Exercise = { name: string; note: string; sets: string; reps: string; intensity: string; purpose: string };
interface Finding {
  key: string;
  level: 'danger' | 'warn' | 'ok';
  badge: string;
  title: string;
  why: string;
  metric?: string;
  exercises: Exercise[];
  ref?: string;
}

const LEVEL_STYLE: Record<Finding['level'], { border: string; bg: string; badge: string }> = {
  danger: { border: '#F0C9D1', bg: '#FDF4F6', badge: colors.danger },
  warn:   { border: '#EDE0B8', bg: '#FDFAF0', badge: '#8A6B00' },
  ok:     { border: 'var(--color-surface-secondary)', bg: 'transparent', badge: '#4F5B63' },
};

function FindingCard({ f }: { f: Finding }) {
  const st = LEVEL_STYLE[f.level];
  return (
    <div className="rounded-lg overflow-hidden mb-2.5" style={{ border: `1px solid ${st.border}` }}>
      <div className="flex gap-2.5 items-start p-3" style={{ background: st.bg }}>
        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded whitespace-nowrap mt-0.5"
          style={{ background: st.badge, color: f.level === 'ok' ? '#fff' : '#fff' }}>{f.badge}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold mb-0.5">{f.title}</p>
          <p className="text-[11.5px] text-text-secondary">{f.why}</p>
          {f.metric && (
            <p className="text-[11px] text-text-secondary mt-0.5" style={{ fontFamily: 'var(--font-data)' }}>{f.metric}</p>
          )}
        </div>
      </div>
      {f.exercises.length > 0 && (
        <div className="px-3 pt-2.5 pb-3 border-t border-dashed border-surface-secondary">
          <p className="text-[10.5px] text-text-secondary font-semibold tracking-[1px] mb-2">처방</p>
          {f.exercises.map((ex, i) => <ExerciseItem key={i} ex={ex} />)}
        </div>
      )}
      {f.ref && <p className="px-3 pb-2 text-[10px] text-text-secondary">근거 · {f.ref}</p>}
    </div>
  );
}

// 처방 계산부. 화면(PrescriptionSection)과 인쇄 리포트(PhysicalReport)가 같은 결과를 써야
// 해서 컴포넌트 밖으로 뺐다. 둘이 각자 계산하면 종이와 화면이 다른 말을 하게 된다.
function buildFindings({ record, history, thresholds, teamScores, speed, speedVals }: {
  record: PhysicalTestRow | null; history: PhysicalTestRow[];
  thresholds: ValdThreshold[]; teamScores: Record<RadarAxisKey, number | null>[];
  speed: SpeedCustomRow | null; speedVals: SpeedAxisVals;
}): Finding[] {
  const findings: Finding[] = [];

  // 1) 좌우 불균형 — 4종 전부. 10% 이상은 처방까지, 5~10% 는 관찰만(과처방 방지).
  if (record) {
    for (const key of VALD_LR_KEYS) {
      const acc = VALD_ACCESSORS[key];
      const def = VALD_METRIC_DEFS.find(d => d.key === key);
      if (!acc.left || !acc.right || !def) continue;
      const l = acc.left(record), r = acc.right(record);
      if (l == null || r == null) continue;
      const imb = Math.abs(imbalancePercent(l, r));
      if (imb < 5) continue;
      const weak = l < r ? '좌' : '우';
      findings.push(imb >= 10 ? {
        key, level: 'danger', badge: '편측 보강',
        title: `${def.label} 좌우 불균형 ${imb.toFixed(1)}%`,
        why: `모니터링 기준(10%)을 넘습니다 — 약한 쪽(${weak}) 보강 대상입니다.`,
        metric: `좌 ${l.toFixed(1)}${def.unit} · 우 ${r.toFixed(1)}${def.unit}`,
        exercises: RADAR_INJURY_EXERCISES[key] ?? [],
        ref: '10% 는 복귀·모니터링 기준. 비대칭 자체의 부상 예측력은 제한적 (Green et al. 2018; Bishop et al. 2018)',
      } : {
        key, level: 'warn', badge: '관찰',
        title: `${def.label} 좌우 불균형 ${imb.toFixed(1)}%`,
        why: '5~10% 구간입니다. 별도 처방 없이 다음 차수까지 추이를 봅니다.',
        metric: `좌 ${l.toFixed(1)}${def.unit} · 우 ${r.toFixed(1)}${def.unit}`,
        exercises: [],
      });
    }
  }

  // 2) 레이더 약점 축 — 팀 평균 대비 격차가 가장 큰 축. 처방에 근거 점수를 같이 보인다.
  if (record) {
    const { scores } = computeRadarScores(history, thresholds, speedVals);
    const teamAvg = Object.fromEntries(RADAR_AXES.map(a => {
      const vals = teamScores.map(s => s[a.key]).filter((v): v is number => v != null);
      return [a.key, vals.length > 0 ? vals.reduce((x, y) => x + y, 0) / vals.length : null];
    })) as Record<RadarAxisKey, number | null>;
    const worst = RADAR_AXES
      .filter(a => scores[a.key] != null && teamAvg[a.key] != null)
      .sort((a, b) => (scores[a.key]! - teamAvg[a.key]!) - (scores[b.key]! - teamAvg[b.key]!))[0];
    if (worst) {
      const gap = Math.round(scores[worst.key]! - teamAvg[worst.key]!);
      findings.push({
        key: `axis-${worst.key}`, level: 'warn', badge: '보강',
        title: `${worst.ko} ${Math.round(scores[worst.key]!)}점 · 팀 평균보다 ${Math.abs(gap)}점 ${gap < 0 ? '낮음' : '높음'}`,
        why: '6개 축 중 팀 평균과의 격차가 가장 큽니다 — 우선 보강 대상입니다.',
        metric: RADAR_AXES.map(a => `${a.ko} ${scores[a.key] != null ? Math.round(scores[a.key]!) : '—'}`).join(' · '),
        exercises: RADAR_REINFORCE_EXERCISES[worst.key],
      });
    }
  }

  // 3) ADD:ABD 비율 — K리그 OT p.38 '무릎 안정성: 내전근/외전근 비율 기반 ACL 리스크 관리'.
  // OT 는 개념만 제시하고 수치 기준을 주지 않는다. 외부 아카데미(U17~U19) 보고값 0.9±0.2 를
  // 참고 구간으로 쓰고, 벗어나면 관찰로만 올린다 — 처방을 걸 만한 근거는 아직 없다.
  if (record) {
    const ad = computeValdValue('hip_adduction', record);
    const ab = computeValdValue('hip_abduction', record);
    if (ad != null && ab != null && ab > 0) {
      const ratio = ad / ab;
      const off = ratio < 0.7 || ratio > 1.3;
      findings.push({
        key: 'add-abd', level: off ? 'warn' : 'ok', badge: off ? '관찰' : '참고',
        title: `고관절 내전:외전 비율 ${ratio.toFixed(2)}`,
        why: off
          ? '참고 구간(0.7~1.3)을 벗어났습니다. 무릎 안정성과 관련된 비율이라 다음 차수까지 추이를 봅니다.'
          : '참고 구간(0.7~1.3) 안입니다.',
        metric: `내전 ${ad.toFixed(1)}N · 외전 ${ab.toFixed(1)}N`,
        exercises: [],
        ref: 'K리그 유소년 측정 OT p.38 무릎 안정성 · 외부 아카데미(U17~U19) 보고값 0.9±0.2. OT 에 수치 기준은 없음',
      });
    }
  }

  // 3) EUR — 타당성 논란이 있어 처방이 아니라 참고 수치로만 싣는다.
  const eur = record ? computeValdValue('eur', record) : null;
  if (eur != null) {
    findings.push({
      key: 'eur', level: 'ok', badge: '참고',
      title: `EUR ${eur.toFixed(2)}`,
      why: eur <= 1.1 ? '반동 활용이 낮은 편입니다.' : eur >= 1.15 ? '반동 의존이 높은 편입니다.' : '일반적인 범위입니다.',
      metric: 'CMJ ÷ Squat Jump',
      exercises: [],
      ref: 'SSC 지표로 제안됐으나 타당성 논란 (McGuigan et al. 2006; Kozinc et al. 2021). 높은 값이 나쁜 SJ 를 뜻할 수도 있어 단독 판단 금지',
    });
  }

  // 4) 속도 — 현재 수준 안내.
  if (speed) {
    findings.push({
      key: 'speed', level: 'ok', badge: '유지',
      title: `MAS ${speed.mas}km/h (${classifyMAS(speed.mas)}) · MSS ${speed.mss}km/h`,
      why: `Zone5(MSS 80%) 기준 ${speed.zone5_mss80.toFixed(1)}km/h 이상에서 최고속주 훈련을 권장합니다.`,
      exercises: [],
    });
  }

  // 5) 상시 루틴.
  findings.push({
    key: 'fifa11', level: 'ok', badge: '상시',
    title: FIFA11_EXERCISE.name,
    why: '훈련 전 필수 루틴입니다.',
    exercises: [FIFA11_EXERCISE],
    ref: 'FIFA 11+ · Copenhagen adduction 은 서혜부 부상 위험 감소 보고 (Harøy et al. 2017)',
  });

  const order = { danger: 0, warn: 1, ok: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return findings;
}

function PrescriptionSection({ record, history, thresholds, teamScores, maturity, speed, speedVals }: {
  record: PhysicalTestRow | null; history: PhysicalTestRow[];
  thresholds: ValdThreshold[]; teamScores: Record<RadarAxisKey, number | null>[];
  maturity: MaturityRow | null; speed: SpeedCustomRow | null; speedVals: SpeedAxisVals;
}) {
  const findings = buildFindings({ record, history, thresholds, teamScores, speed, speedVals });

  const stageNote: Record<string, string> = {
    '성장 급증기 전': '코디네이션·기초 체력 위주로, 고강도 근력 훈련은 신중히 접근합니다.',
    '성장 급증기': '성장통·부상 위험이 높은 시기로 훈련 부하 조절이 필요합니다.',
    '성장 급증기 후': '근력·파워 훈련 비중을 늘려도 되는 시기입니다.',
  };
  const stage = maturity?.maturity_stage ?? null;

  if (!record && !speed) {
    return <div className="chart-card text-center text-text-secondary py-8">처방에 필요한 측정 기록이 없습니다.</div>;
  }

  return (
    <div className="chart-card">
      <div className="chart-title">운동 처방</div>
      <p className="text-[11px] text-text-secondary mb-3">
        측정값에서 발견한 것과 그에 대한 운동을 한 항목으로 묶어 위험도 순으로 보여줍니다.
      </p>

      {/* 성숙도 수치의 단일 출처는 위 MaturitySection 이다. 이 바는 '처방 강도의 전제'로서
          단계만 싣는다 — 성장 도달률까지 반복하면 한 화면에 같은 값이 세 번 나온다. */}
      {stage && (
        <div className="flex gap-2 flex-wrap items-center rounded-lg px-3 py-2.5 mb-4" style={{ background: 'var(--color-surface-secondary)' }}>
          <span className="text-[12px] font-bold">신체 성숙도</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{
            background: MATURITY_STAGE_LABEL[stage]?.bg ?? '#eee',
            color: MATURITY_STAGE_LABEL[stage]?.text ?? '#666',
          }}>{MATURITY_STAGE_LABEL[stage]?.label ?? stage}</span>
          <span className="text-[11.5px] text-text-secondary">
            · {stageNote[stage] ?? ''} 아래 처방 강도의 전제입니다.
          </span>
          <span className="text-[10px] text-text-secondary w-full">근거 · Lloyd &amp; Oliver 2012 Youth Physical Development 모델</span>
        </div>
      )}

      {findings.map(f => <FindingCard key={f.key} f={f} />)}
    </div>
  );
}

// 이달의 변화 — 그 선수의 직전 월 대비 변화.
// 성숙도는 월별 비교를 하지 않는다: Mirwald 성숙 단계는 앉은키(leg length)가 필요한데
// growth_tracking 에는 키·몸무게만 쌓이고 앉은키는 players 의 1회성 기준 측정값뿐이다.
// 없는 월별 앉은키로 단계를 만들면 지어낸 숫자가 되므로 현재값으로만 보여준다.
function MonthlyChangeCard({ bodyComp, maturity }: { bodyComp: BodyCompositionRow[]; maturity: MaturityRow | null }) {
  const sorted = useMemo(
    () => [...bodyComp].sort((a, b) => a.year - b.year || a.month - b.month),
    [bodyComp]);
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  if (!latest) return null;

  const metrics = ([['height', '키', 'cm'], ['weight', '몸무게', 'kg']] as const).map(([key, label, unit]) => {
    const to = latest[key];
    const from = prev?.[key] ?? null;
    const delta = from != null && to != null ? +(to - from).toFixed(1) : null;
    return { key, label, unit, from, to, delta };
  });

  const period = prev
    ? `${prev.month}월 → ${latest.month}월`
    : `${latest.month}월`;

  return (
    <div className="chart-card">
      <div className="chart-title">
        이달의 변화 <span className="text-text-secondary font-normal text-xs">({period} · 직전 측정 월 대비)</span>
      </div>
      <div className="grid grid-cols-3 gap-3 stat-grid-4">
        {metrics.map(m => (
          <div key={m.key} className="rounded-lg border border-surface-secondary p-3">
            <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>{m.label}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-data)' }}>
                {m.to != null ? `${m.to}${m.unit}` : '—'}
              </span>
              {m.delta != null && m.delta !== 0 && (
                <span className={`text-xs font-medium ${m.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {m.delta > 0 ? '▲' : '▼'}{Math.abs(m.delta)}{m.unit}
                </span>
              )}
              {m.delta === 0 && <span className="text-xs text-text-secondary">변화 없음</span>}
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5" style={{ fontFamily: 'var(--font-data)' }}>
              {m.from != null && m.to != null ? `${m.from} → ${m.to}${m.unit}` : '직전 월 기록 없음'}
            </p>
          </div>
        ))}

        <div className="rounded-lg border border-surface-secondary p-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>성숙도</p>
          {maturity?.maturity_stage ? (
            <>
              <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: MATURITY_STAGE_LABEL[maturity.maturity_stage]?.bg ?? '#eee',
                  color: MATURITY_STAGE_LABEL[maturity.maturity_stage]?.text ?? '#666',
                }}>
                {maturity.maturity_stage}
              </span>
              <p className="text-[11px] text-text-secondary mt-1" style={{ fontFamily: 'var(--font-data)' }}>
                성장 도달률 {maturity.pah_percent != null ? `${maturity.pah_percent}%` : '—'}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold mt-1">—</p>
          )}
          <p className="text-[10px] text-text-secondary mt-1">기준 측정일 기준 · 월별 비교 없음</p>
        </div>
      </div>
      <p className="text-[10px] text-text-secondary mt-2">
        성숙 단계는 앉은키가 필요해 월별로 계산하지 않습니다(앉은키는 기준 측정 1회만 수집).
      </p>
    </div>
  );
}

const PHYSICAL_SECTIONS: { id: string; label: string }[] = [
  { id: 'sec-radar', label: '프로필' },
  { id: 'sec-body', label: '체성분' },
  { id: 'sec-month', label: '이달의 변화' },
  { id: 'sec-maturity', label: '성숙도' },
  { id: 'sec-vald', label: 'VALD' },
  { id: 'sec-valdtrend', label: 'VALD 추이' },
  { id: 'sec-speed', label: 'Speed' },
  { id: 'sec-rx', label: '운동 처방' },
];

function PhysicalSectionIndex() {
  return (
    <nav aria-label="피지컬 섹션" className="sticky top-[72px] z-30 -mx-1 px-1 py-2 bg-bg/95 backdrop-blur-sm">
      <div className="flex gap-1.5 flex-wrap">
        {PHYSICAL_SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`}
            className="text-[11px] px-2.5 py-1 rounded-full border border-surface-secondary bg-surface text-text-secondary hover:border-brand hover:text-brand transition-colors">
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ── 피지컬 리포트 (A4 세로 5페이지 · 선수·학부모 전달용) ────────────────────
// 인쇄 CSS 로 뽑는다(jspdf 는 한글 폰트가 없어 html2canvas 래스터가 되고, 9.4pt 한글 표가
// 인쇄물에서 뭉개진다). 화면 카드를 재사용하지 않고 전용 레이아웃을 쓴다.
// 색은 전부 index.css @theme 값이다. SVG 속성에는 CSS 변수를 못 넣어 상수로 둔다.
// 인쇄 리포트는 흰 종이에 9~11px 로 찍혀 학부모에게 간다. 화면용 토큰을 그대로 쓰면
// --color-text-disabled(#7D8990)가 3.59:1, --color-load-optimal(#008C7E)이 4.16:1 로
// AA(4.5:1)에 못 미친다. 인쇄 전용으로 각각 4.71:1, 5.38:1 까지 어둡게 내린 값이다.
const PR = {
  brand: '#A42843', alt: '#153E6F', ok: '#00786C', warn: '#8A6B00',
  neutral: '#66717A', ink: '#101820', ink2: '#4F5B63', ink3: '#646E75',
  line: '#EEF3F1', bg: '#F6F8F7',
};
// 전달용 문서라 VALD 영문 지표명 대신 선수·학부모가 읽는 말로 바꿔 싣는다.
const PR_LR_LABEL: Record<string, string> = {
  nordic_curl: '뒷허벅지 버티는 힘',
  ham_iso: '뒷허벅지 당기는 힘',
  hip_adduction: '허벅지 모으는 힘',
  hip_abduction: '허벅지 벌리는 힘',
};
const PR_LR_CRIT: Record<string, string> = {
  nordic_curl: '다치기 쉬운 부위의 핵심 근력',
  ham_iso: '달릴 때 쓰는 힘',
  hip_adduction: '방향 바꿀 때 쓰는 힘',
  hip_abduction: '몸의 중심을 잡는 힘',
};
const PR_JUMP_ROWS = [
  { key: 'cmj_height', label: '제자리 점프 높이', crit: '반동을 쓴 최고 점프', unit: 'cm', dec: 1 },
  { key: 'squat_jump_height', label: '반동 없는 점프', crit: '앉은 자세에서 바로 뛰기', unit: 'cm', dec: 1 },
  { key: 'cmj_peak_force', label: '점프할 때 미는 힘', crit: '땅을 밀어내는 최대 힘', unit: 'N', dec: 0 },
  { key: 'eur', label: '반동 활용도', crit: '반동을 얼마나 잘 쓰는지', unit: '', dec: 2 },
];
const PR_SPRINT_ROWS = [
  { key: 'sprint_5m', label: '5m 달리기', crit: '출발 순간의 반응과 가속' },
  { key: 'sprint_10m', label: '10m 달리기', crit: '짧은 거리 가속' },
  { key: 'sprint_30m', label: '30m 달리기', crit: '최고 속도까지 올라가는 능력' },
  { key: 'cod_ball', label: '볼을 몰고 방향 전환', crit: '공을 다루며 지그재그 코스 통과' },
  { key: 'cod_run', label: '볼 없이 방향 전환', crit: '같은 코스를 공 없이 통과' },
];
const PR_TREND_CHARTS: { key: string; label: string; unit: string; lr?: boolean }[] = [
  { key: 'cmj_height', label: '제자리 점프', unit: 'cm' },
  { key: 'cmj_peak_force', label: '점프할 때 미는 힘', unit: 'N' },
  { key: 'nordic_curl', label: '뒷허벅지 버티는 힘', unit: 'N', lr: true },
  { key: 'hip_adduction', label: '허벅지 모으는 힘', unit: 'N', lr: true },
];
const PR_TREND_KEYS = [
  { key: 'cmj_height', label: '제자리 점프', unit: 'cm' },
  { key: 'nordic_curl', label: '뒷허벅지 버티는 힘', unit: 'N' },
  { key: 'hip_adduction', label: '허벅지 모으는 힘', unit: 'N' },
  { key: 'hip_abduction', label: '허벅지 벌리는 힘', unit: 'N' },
  { key: 'sprint_30m', label: '30m 달리기', unit: '초' },
];
const PR_GRADE_LABEL = ['보완 필요', '보완 필요', '보통', '우수', '매우 우수'];
const PR_NEXT = '다음 측정 차수';

type PrSeries = { name: string; color: string; vals: (number | null)[] };

function prLevel(score: number | null): number | null {
  if (score == null) return null;
  return Math.max(1, Math.min(5, Math.ceil(score / 20)));
}

function PrDots({ score }: { score: number | null }) {
  const n = prLevel(score);
  if (n == null) return <span className="pr-soon">{PR_NEXT}에 측정 예정</span>;
  return (
    <>
      <span className="pr-dots">
        {[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}
      </span>
      <span className="pr-gr" style={{ color: n >= 4 ? PR.ok : n === 3 ? PR.ink2 : PR.warn }}>
        {PR_GRADE_LABEL[n - 1]}
      </span>
    </>
  );
}

function PrPending({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      border: '.5px dashed #EEF3F1', borderRadius: 4, background: PR.bg,
      padding: '6mm 8mm', textAlign: 'center', marginTop: '4mm',
    }}>
      <b style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: '2.2mm' }}>{title}</b>
      <p style={{ fontSize: 11, color: PR.ink2, lineHeight: 1.8 }}>{body}</p>
      <span style={{
        display: 'inline-block', marginTop: '3mm', fontSize: 10.5, fontWeight: 700,
        color: PR.brand, background: '#F4E4E8', padding: '1.4mm 3.5mm', borderRadius: 3,
      }}>{PR_NEXT}에 측정 예정</span>
    </div>
  );
}

// 팀 임계(최대/평균/최저)를 점선으로 같이 그린다. 축 범위는 임계까지 포함해야
// 임계선이 차트 밖으로 밀려나지 않는다.
function PrLine({ labels, series, th, h = 104, w = 300 }: {
  labels: string[]; series: PrSeries[]; th?: (number | null)[]; h?: number; w?: number;
}) {
  const pl = 30, pr = 8, pt = 10, pb = 18;
  const all: number[] = [];
  series.forEach(s => s.vals.forEach(v => { if (v != null) all.push(v); }));
  th?.forEach(v => { if (v != null) all.push(v); });
  if (all.length === 0) return null;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi === lo) { const d = Math.abs(hi || 1) * 0.1; hi += d; lo -= d; }
  const span0 = hi - lo;
  lo -= span0 * 0.12; hi += span0 * 0.12;
  const n = labels.length;
  const X = (i: number) => pl + (w - pl - pr) * (n < 2 ? 0.5 : i / (n - 1));
  const Y = (v: number) => pt + (h - pt - pb) * (1 - (v - lo) / (hi - lo));
  const thName = ['팀 최고', '팀 평균', '팀 최저'];
  const thColor = [PR.ok, PR.ink2, PR.brand];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} height={h}>
      <line x1={pl} y1={h - pb} x2={w - pr} y2={h - pb} stroke="#D7DEDB" strokeWidth={0.7} />
      {th?.map((v, i) => v == null ? null : (
        <g key={`th${i}`}>
          <line x1={pl} y1={Y(v)} x2={w - pr} y2={Y(v)} stroke={thColor[i]} strokeWidth={0.8}
            strokeDasharray="3.5 3" opacity={0.7} />
          <text x={w - pr} y={Y(v) - 2.2} textAnchor="end" fontSize={7} fill={thColor[i]}>{thName[i]}</text>
        </g>
      ))}
      {series.map(se => {
        const segs: [number, number][][] = [];
        let cur: [number, number][] = [];
        se.vals.forEach((v, i) => {
          if (v == null) { if (cur.length) segs.push(cur); cur = []; }
          else cur.push([X(i), Y(v)]);
        });
        if (cur.length) segs.push(cur);
        return (
          <g key={se.name}>
            {segs.map((g, gi) => g.length > 1 && (
              <polyline key={gi} fill="none" stroke={se.color} strokeWidth={1.8} strokeLinejoin="round"
                points={g.map(pt2 => pt2.join(',')).join(' ')} />
            ))}
            {se.vals.map((v, i) => v == null ? null : (
              <circle key={i} cx={X(i)} cy={Y(v)} r={2.4} fill="#fff" stroke={se.color} strokeWidth={1.5} />
            ))}
          </g>
        );
      })}
      {labels.map((t, i) => (
        <text key={i} x={X(i)} y={h - pb + 10} textAnchor="middle" fontSize={7.6} fill={PR.ink3}
          fontFamily="DM Mono, monospace">{t}</text>
      ))}
      {[lo, (lo + hi) / 2, hi].map((v, i) => (
        <text key={i} x={pl - 4} y={Y(v) + 2.5} textAnchor="end" fontSize={7.4} fill={PR.ink3}
          fontFamily="DM Mono, monospace">{v.toFixed(span0 < 5 ? 1 : 0)}</text>
      ))}
    </svg>
  );
}

function PrRadar({ axes }: { axes: { ko: string; me: number | null }[] }) {
  const w = 352, h = 362, cx = w / 2, cy = h / 2 + 2, R = 126, n = axes.length;
  const pt = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (r: (a: { me: number | null }) => number) =>
    axes.map((a, i) => pt(i, r(a)).map(v => v.toFixed(1)).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} height={h}>
      {[0.25, 0.5, 0.75, 1].map(k => (
        <polygon key={k} points={axes.map((_, i) => pt(i, R * k).map(v => v.toFixed(1)).join(',')).join(' ')}
          fill="none" stroke={PR.line} strokeWidth={0.7} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke={PR.line} strokeWidth={0.7} />;
      })}
      <polygon points={poly(() => R * 0.5)} fill="rgba(102,113,122,.08)" stroke={PR.neutral} strokeWidth={1.3} />
      <polygon points={poly(a => R * (a.me ?? 0) / 100)} fill="rgba(164,40,67,.14)" stroke={PR.brand} strokeWidth={1.8} />
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 16);
        const n2 = prLevel(a.me);
        return (
          <g key={a.ko}>
            <text x={x.toFixed(1)} y={y.toFixed(1)} textAnchor="middle" fontSize={8.4} fontWeight={700} fill={PR.ink}>{a.ko}</text>
            <text x={x.toFixed(1)} y={(y + 10).toFixed(1)} textAnchor="middle" fontSize={8} fill={PR.brand} fontWeight={700}>
              {n2 == null ? '측정 전' : PR_GRADE_LABEL[n2 - 1]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PrZoneBar({ z, mss }: { z: number[]; mss: number }) {
  const w = 560, h = 62;
  const cols = ['#EEF3F1', '#E0F3F0', '#008C7E', '#F4E4E8', '#A42843'];
  const seg: [number, number, string, number][] = [
    [0, z[0], '매우 가벼움', 0], [z[0], z[1], '가벼움', 1], [z[1], z[2], '중간', 2],
    [z[2], z[3], '빠름', 3], [z[3], z[4], '', -1], [z[4], mss, '최대', 4],
  ];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} height={h}>
      {seg.map(([v1, v2, nm, ci], i) => {
        const x1 = v1 / mss * w, x2 = v2 / mss * w;
        return (
          <g key={i}>
            <rect x={x1.toFixed(1)} y={2} width={(x2 - x1).toFixed(1)} height={24} fill={ci < 0 ? PR.bg : cols[ci]} />
            {nm && <text x={((x1 + x2) / 2).toFixed(1)} y={18.5} textAnchor="middle" fontSize={9}
              fill={(ci === 2 || ci === 4) ? '#fff' : PR.ink} fontWeight={700}>{nm}</text>}
            {v2 !== mss && <text x={x2.toFixed(1)} y={39} textAnchor="middle" fontSize={10} fill={PR.ink2}
              fontWeight={700} fontFamily="DM Mono, monospace">{v2}</text>}
          </g>
        );
      })}
      <text x={0} y={54} fontSize={9.5} fill={PR.ink3} fontFamily="DM Mono, monospace">0 km/h</text>
      <text x={w} y={54} textAnchor="end" fontSize={9.5} fill={PR.ink3} fontFamily="DM Mono, monospace">{mss} km/h</text>
    </svg>
  );
}

// buildFindings 의 문구는 코치용이다(「Nordic Curl (햄스트링 근력) 좌우 불균형」).
// 계산은 그대로 쓰고 선수·학부모가 읽을 제목·설명만 바꿔 싣는다.
function prRxText(fd: Finding): { title: string; why: string } {
  const lrKey = VALD_LR_KEYS.find(k => fd.key === k);
  if (lrKey) {
    const weak = fd.metric && /좌 ([\d.]+)\S* · 우 ([\d.]+)/.exec(fd.metric);
    const side = weak ? (Number(weak[1]) < Number(weak[2]) ? '왼쪽' : '오른쪽') : null;
    return {
      title: `${PR_LR_LABEL[lrKey] ?? lrKey} ${side ? `${side} 키우기` : '좌우 균형 맞추기'}`,
      why: `좌우 차이가 모니터링 기준(10%)을 넘습니다. 한쪽이 약하면 빠르게 달릴 때 그쪽에 부담이 몰립니다.`
        + (fd.metric ? ` (${fd.metric})` : ''),
    };
  }
  if (fd.key.startsWith('axis-')) {
    return {
      title: `${fd.title.split(' ')[0]} 보강하기`,
      why: '여섯 가지 능력 중 팀 평균과의 차이가 가장 큰 부분입니다. 지금 챙기면 가장 많이 올라갑니다.',
    };
  }
  if (fd.key === 'fifa11') {
    return { title: '훈련 전 준비운동', why: '매 훈련 전에 하는 기본 루틴입니다. 부상 예방 효과가 보고된 프로그램입니다.' };
  }
  return { title: fd.title, why: fd.why };
}

// 누적 3점(5·10·30m)에 단일지수 모델 d(t)=V0(t+τe^(-t/τ)-τ) 을 맞춰
// 최고속도와 분리된 가속 능력을 뽑는다 (Samozino/Morin). 우리 37명에서 a_max 와 V0 의
// 상관은 -0.08 로 서로 독립이고, a_max 는 0~5m 속도와 r=0.92 다.
// 절대값은 출발 게이트 위치에 좌우되므로(우리 τ 평균 0.57s vs 문헌 성인 1.1~1.2s)
// 문헌값과 비교하지 않고 팀 내부 비교용으로만 쓴다.
function sprintProfile(t5: number | null, t10: number | null, t30: number | null):
  { v0: number; tau: number; amax: number } | null {
  if (t5 == null || t10 == null || t30 == null) return null;
  if (!(t5 > 0 && t10 > t5 && t30 > t10)) return null;
  const pts: [number, number][] = [[t5, 5], [t10, 10], [t30, 30]];
  const err = (V: number, tau: number) => pts.reduce((acc, [t, d]) => {
    const m = V * (t + tau * Math.exp(-t / tau) - tau);
    return acc + (m - d) * (m - d);
  }, 0);
  let best = { e: Infinity, v: 8, tau: 0.5 };
  for (let V = 6; V <= 11.001; V += 0.05) {
    for (let T = 0.2; T <= 0.9001; T += 0.005) {
      const e = err(V, T);
      if (e < best.e) best = { e, v: V, tau: T };
    }
  }
  for (let V = best.v - 0.05; V <= best.v + 0.05; V += 0.005) {
    for (let T = Math.max(0.05, best.tau - 0.005); T <= best.tau + 0.005; T += 0.0005) {
      const e = err(V, T);
      if (e < best.e) best = { e, v: V, tau: T };
    }
  }
  return { v0: best.v, tau: best.tau, amax: best.v / best.tau };
}

const PR_TOTAL_PAGES = 5;

function PrPage({ no, secno, title, sub, player, measured, children }: {
  no: number; secno: string; title: string; sub: string;
  player: PlayerWithAcwr; measured: string; children: React.ReactNode;
}) {
  const pg = `${String(no).padStart(2, '0')} / ${String(PR_TOTAL_PAGES).padStart(2, '0')}`;
  const who = `${player.position} · ${player.grade} · ${new Date().getFullYear()} 피지컬 리포트`;
  return (
    <div className="pr-page">
      {no === 1 ? (
        <>
          <div className="pr-hero" />
          <div className="pr-masthead">
            <div className="pr-badge" style={{ width: 21, height: 21, fontSize: 9 }}>DH</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-.2px' }}>대전하나시티즌</div>
              <div style={{ fontSize: 9.5, color: PR.ink3, fontFamily: 'var(--font-data)' }}>
                GPS Training Load Dashboard
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '-.2px' }}>
                {player.name}{' '}
                <span style={{ fontFamily: 'var(--font-data)', fontWeight: 500, color: PR.ink3 }}>
                  #{player.jersey_number}
                </span>
              </div>
              <div style={{ fontSize: 9.5, color: PR.ink2, marginTop: '.4mm' }}>{who}</div>
            </div>
            <div style={{
              marginLeft: '5mm', alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 700,
              color: PR.ink3, fontFamily: 'var(--font-data)',
            }}>{pg}</div>
          </div>
        </>
      ) : (
        <div className="pr-band">
          <div className="pr-badge" style={{ width: 18, height: 18, fontSize: 8, borderWidth: 1.2 }}>DH</div>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '-.1px' }}>대전하나시티즌</div>
          <div style={{ flex: 1, fontSize: 9.5, color: PR.ink2 }}>
            {player.name} #{player.jersey_number} · {who}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: PR.ink3, fontFamily: 'var(--font-data)' }}>{pg}</div>
        </div>
      )}
      <div className="pr-secno">{secno}</div>
      <h1 className="pr-h1">{title}<span className="pr-sub">{sub}</span></h1>
      {children}
      <div className="pr-foot">
        <span>대전하나시티즌 · {player.name} 피지컬 리포트</span>
        <span className="pr-num">
          {measured} 측정 · {new Date().toISOString().slice(0, 10)} 발행 · {no} / {PR_TOTAL_PAGES}
        </span>
      </div>
    </div>
  );
}

function PhysicalReport({ player, record, history, bodyComp, maturity, speed, speedHistory, thresholds, teamScores, speedVals }: {
  player: PlayerWithAcwr; record: PhysicalTestRow | null; history: PhysicalTestRow[];
  bodyComp: BodyCompositionRow[]; maturity: MaturityRow | null;
  speed: SpeedCustomRow | null; speedHistory: SpeedCustomTestRow[];
  thresholds: ValdThreshold[];
  teamScores: Record<RadarAxisKey, number | null>[]; speedVals: SpeedAxisVals;
}) {
  const f = (v: number | null | undefined, n = 1) => v == null ? '—' : Number(v).toFixed(n);
  // 임계는 '전체' 기준으로 고정한다 — 학년별 표본이 적어 학년 임계는 한두 명으로 흔들린다.
  const thOf = (k: string): (number | null)[] => {
    const t = thresholds.find(x => x.metric_key === k && x.grade === '전체');
    return [t?.max_value ?? null, t?.avg_value ?? null, t?.min_value ?? null];
  };
  const sc = (k: string, v: number | null) => scoreForMetric(k, v, thresholds);
  const avgOfNullable = (xs: (number | null)[]) => {
    const t = xs.filter((x): x is number => x != null);
    return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null;
  };

  const L = record;
  const PRV = history[1] ?? null;
  // 측정 일정상 특정 항목만 빠진 회차가 흔하다. '지난 측정' 열에 직전 회차만 보면
  // 그 회차에 그 항목이 없을 때 전부 '—' 가 된다 — 값이 있는 가장 최근 회차까지 거슬러 올라간다.
  const prevValOf = (key: string): number | null => {
    for (const r of history.slice(1)) {
      const v = computeValdValue(key, r);
      if (v != null) return v;
    }
    return null;
  };
  const chron = [...history].reverse();
  const chronLabels = chron.map(r => r.test_round ?? r.test_date.slice(2, 7));
  const measured = L?.test_date ?? '—';

  // 6축 전부 화면 레이더와 같은 계산을 쓴다(항목이 빠진 회차는 이전 회차로 보완).
  const { scores } = computeRadarScores(history, thresholds, speedVals);
  const axes = RADAR_AXES.map(a => ({ ko: a.ko, me: scores[a.key] }));
  const teamAvgOf = (k: RadarAxisKey) => avgOfNullable(teamScores.map(s => s[k]));
  const axesWithTeam = RADAR_AXES.map(a => ({ ko: a.ko, me: scores[a.key], team: teamAvgOf(a.key) ?? 50 }));
  const now = avgOfNullable(axes.map(a => a.me));
  const prevScores = PRV ? computeRadarScores(history.slice(1), thresholds, speedVals).scores : null;
  const prev = prevScores ? avgOfNullable(RADAR_AXES.map(a => prevScores[a.key])) : null;
  const delta = (now != null && prev != null) ? Math.round(now) - Math.round(prev) : null;

  // 좌우 비대칭 10% 이상은 평균 등급보다 먼저 알려야 한다.
  const lrRows = VALD_LR_KEYS.map(k => {
    const acc = VALD_ACCESSORS[k];
    const def = VALD_METRIC_DEFS.find(d => d.key === k);
    const l = acc.left && L ? acc.left(L) : null;
    const r = acc.right && L ? acc.right(L) : null;
    const imb = (l != null && r != null) ? Math.abs(imbalancePercent(l, r)) : null;
    return { k, label: PR_LR_LABEL[k] ?? def?.label ?? k, crit: PR_LR_CRIT[k] ?? '', l, r, imb };
  });
  const worstLr = lrRows.filter(x => x.imb != null).sort((a, b) => b.imb! - a.imb!)[0] ?? null;

  const growth = [...bodyComp].sort((a, b) => a.year - b.year || a.month - b.month);
  const gLast = growth[growth.length - 1] ?? null;
  const gFirstOfYear = growth.find(g => gLast && g.year === gLast.year) ?? null;
  const speedChron = [...speedHistory].sort((a, b) => a.test_date.localeCompare(b.test_date));

  const findings = buildFindings({ record, history, thresholds, teamScores, speed, speedVals });
  const rx = findings.filter(x => x.exercises.length > 0).slice(0, 3);

  const improved = chron.length >= 2 ? PR_TREND_KEYS
    .map(({ key, label, unit }) => {
      const prevV = computeValdValue(key, chron[chron.length - 2]);
      const nowV = computeValdValue(key, chron[chron.length - 1]);
      if (prevV == null || nowV == null) return null;
      const def = VALD_METRIC_DEFS.find(d => d.key === key);
      const better = def?.invert ? nowV < prevV : nowV > prevV;
      return better ? { label, unit, prevV, nowV } : null;
    })
    .filter((x): x is { label: string; unit: string; prevV: number; nowV: number } => x != null)
    .slice(0, 3) : [];

  const page = (no: number, secno: string, title: string, sub: string, body: React.ReactNode) => (
    <PrPage key={no} no={no} secno={secno} title={title} sub={sub} player={player} measured={measured}>{body}</PrPage>
  );

  return (
    <div className="pr-root">
      {/* 01 종합 */}
      {page(1, '01 · 종합', '피지컬 종합 프로필',
        `${measured} 측정 기준 · 여섯 가지 능력을 팀 안에서의 위치로 나타냅니다`,
        <>
          <div className="pr-scores">
            <div>
              <div className="pr-sc-lb">지난 측정{PRV ? ` (${PRV.test_date})` : ''}</div>
              <div className="pr-sc-v" style={{ color: PR.ink3 }}>{prev == null ? '—' : Math.round(prev)}<small> / 100</small></div>
            </div>
            <div>
              <div className="pr-sc-lb">이번 측정 ({measured})</div>
              <div className="pr-sc-v" style={{ color: PR.brand }}>{now == null ? '—' : Math.round(now)}<small> / 100</small></div>
            </div>
            <div>
              <div className="pr-sc-lb">변화</div>
              <div className="pr-sc-v" style={{ fontSize: 22, color: delta == null ? PR.ink3 : delta >= 0 ? PR.ok : PR.brand }}>
                {delta == null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)}`}
              </div>
            </div>
            <div>
              <div className="pr-sc-lb">종합 평가</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: PR.brand }}>
                {prLevel(now) == null ? '측정 전' : PR_GRADE_LABEL[prLevel(now)! - 1]}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '352px 1fr', gap: '9mm', alignItems: 'start' }}>
            <div>
              <PrRadar axes={axes} />
              <div className="pr-lg">
                <span><i style={{ borderColor: PR.brand }} />{player.name}</span>
                <span><i style={{ borderColor: PR.neutral }} />팀 평균</span>
              </div>
            </div>
            <div>
              <div className="pr-tt" style={{ marginTop: 0 }}>능력별 위치</div>
              {axesWithTeam.map(a => (
                <div className="pr-bar" key={a.ko}>
                  <span className="pr-bar-l">{a.ko}</span>
                  <span className="pr-bar-t">
                    <span className="pr-bar-f" style={{ width: `${a.me == null ? 0 : a.me.toFixed(0)}%` }} />
                    <span className="pr-bar-tick" style={{ left: `${a.team}%` }} />
                  </span>
                  <span className="pr-bar-v" style={{ color: a.me == null ? PR.ink3 : PR.ink }}>
                    {prLevel(a.me) == null ? '측정 전' : PR_GRADE_LABEL[prLevel(a.me)! - 1]}
                  </span>
                </div>
              ))}
              <div className="pr-cap">
                색 막대가 길수록 팀 안에서 앞선 위치입니다. 세로 눈금은 팀 평균입니다.
                측정이 빠진 항목은 바로 이전 측정값으로 채워 계산합니다.
              </div>
            </div>
          </div>
          <div className="pr-tt">이번에 달라진 점</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm' }}>
            <div className="pr-strip">
              <div className="pr-strip-h">좋아진 것</div>
              {improved.length === 0
                ? <div style={{ fontSize: 11, color: PR.ink3 }}>비교할 지난 측정이 아직 없습니다</div>
                : improved.map(it => (
                  <div key={it.label} style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.8 }}>
                    {it.label}{' '}
                    <span className="pr-num" style={{ color: PR.ink3, fontWeight: 500 }}>
                      {f(it.prevV, 1)} → {f(it.nowV, 1)} {it.unit}
                    </span>
                  </div>
                ))}
            </div>
            <div className="pr-strip">
              <div className="pr-strip-h">챙겨야 할 것</div>
              {worstLr && worstLr.imb != null && worstLr.imb >= 10 ? (
                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.8 }}>
                  {worstLr.label} 좌우 차이<br />
                  <span style={{ color: PR.brand }}>
                    {f(worstLr.imb)}% · {(worstLr.l ?? 0) < (worstLr.r ?? 0) ? '왼쪽' : '오른쪽'}이 약합니다
                  </span>
                </div>
              ) : <div style={{ fontSize: 11, color: PR.ink3 }}>좌우 차이가 모두 기준 안에 있습니다</div>}
            </div>
          </div>
          <div className="pr-tt">이 리포트 읽는 법</div>
          <table>
            <thead><tr><th style={{ width: '30%' }}>표시</th><th>뜻</th></tr></thead>
            <tbody>
              <tr><td><PrDots score={90} /></td><td>팀 안에서 가장 앞선 쪽에 있습니다</td></tr>
              <tr><td><PrDots score={50} /></td><td>팀 평균 부근입니다. 학년과 성장 단계에 따라 자연스러운 위치입니다</td></tr>
              <tr><td><PrDots score={20} /></td><td>지금 챙기면 좋은 부분입니다. 5페이지에 해당 운동이 있습니다</td></tr>
              <tr><td><PrDots score={null} /></td><td>아직 측정하지 않은 항목입니다. 선수의 능력이 낮다는 뜻이 아닙니다</td></tr>
            </tbody>
          </table>
        </>)}

      {/* 02 신체 */}
      {page(2, '02 · 신체', '키와 몸무게, 성장 단계',
        '월별 기록 · 성장 단계는 또래 대비 성장 진행 정도입니다',
        growth.length === 0 ? (
          <PrPending title="키·몸무게 기록이 아직 없습니다"
            body="월별 신체 측정이 쌓이면 이 페이지에 추이와 변화가 표시됩니다." />
        ) : (
          <>
            <div className="pr-scores">
              <div><div className="pr-sc-lb">키</div><div className="pr-sc-v">{f(gLast?.height)}<small> cm</small></div></div>
              <div><div className="pr-sc-lb">몸무게</div><div className="pr-sc-v">{f(gLast?.weight)}<small> kg</small></div></div>
              <div>
                <div className="pr-sc-lb">{gFirstOfYear?.month ?? 1}월 대비</div>
                <div className="pr-sc-v" style={{ fontSize: 22, color: PR.ok }}>
                  {gLast && gFirstOfYear && gLast.height != null && gFirstOfYear.height != null
                    ? `+${f(gLast.height - gFirstOfYear.height)}` : '—'}
                  {' / '}
                  {gLast && gFirstOfYear && gLast.weight != null && gFirstOfYear.weight != null
                    ? `+${f(gLast.weight - gFirstOfYear.weight)}` : '—'}
                </div>
              </div>
              <div>
                <div className="pr-sc-lb">성장 단계</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: PR.brand }}>
                  {maturity?.maturity_stage ?? '측정 전'}
                </div>
              </div>
            </div>
            <div className="pr-ch" style={{ marginBottom: '4mm' }}>
              <div className="pr-cht">키</div>
              <div className="pr-chs">{growth[0].year}년 {growth[0].month}월 ~ {gLast!.year}년 {gLast!.month}월 · cm</div>
              <PrLine w={640} h={168} labels={growth.map(g => `${g.month}월`)}
                series={[{ name: '키', color: PR.brand, vals: growth.map(g => g.height) }]} />
            </div>
            <div className="pr-ch">
              <div className="pr-cht">몸무게</div>
              <div className="pr-chs">{growth[0].year}년 {growth[0].month}월 ~ {gLast!.year}년 {gLast!.month}월 · kg</div>
              <PrLine w={640} h={168} labels={growth.map(g => `${g.month}월`)}
                series={[{ name: '몸무게', color: PR.alt, vals: growth.map(g => g.weight) }]} />
            </div>
            <div className="pr-cap">
              기록이 없는 달은 점을 찍지 않고 앞뒤 달을 직선으로 이었습니다. 그 사이 선은 실제 측정값이 아닙니다.
            </div>
            <div className="pr-tt">성장 단계</div>
            <table>
              <thead><tr><th>항목</th><th>뜻</th><th className="n">현재</th></tr></thead>
              <tbody>
                <tr>
                  <td>성장 단계</td>
                  <td>키가 가장 빠르게 크는 시기를 지났는지
                    <span className="pr-crit">이 시기를 지나면 근력 훈련 효과가 잘 나타납니다</span></td>
                  <td className="n">{maturity?.maturity_stage ?? <span className="pr-soon">측정 전</span>}</td>
                </tr>
                <tr>
                  <td>성장 진행률</td><td>예측 성인 키에 어느 정도 도달했는지</td>
                  <td className="n">{maturity?.pah_percent != null
                    ? <><span className="pr-num">{f(maturity.pah_percent)}</span> %</>
                    : <span className="pr-soon">측정 전</span>}</td>
                </tr>
                <tr>
                  <td>예측 성인 키</td>
                  <td>부모님 키를 함께 고려한 추정값
                    <span className="pr-crit">추정값이며 실제와 다를 수 있습니다</span></td>
                  <td className="n">{maturity?.predicted_adult_height_cm != null
                    ? <><span className="pr-num">{f(maturity.predicted_adult_height_cm)}</span> cm</>
                    : <span className="pr-soon">측정 전</span>}</td>
                </tr>
              </tbody>
            </table>
          </>
        ))}

      {/* 03 근력과 점프 */}
      {page(3, '03 · 근력과 점프', '힘과 점프 능력',
        `${measured} 측정 · 다섯 단계로 나타낸 팀 안에서의 위치입니다`,
        !L ? (
          <PrPending title="VALD 측정 기록이 아직 없습니다"
            body="점프와 근력 측정이 들어오면 이 페이지에 항목별 평가와 좌우 균형이 표시됩니다." />
        ) : (
          <>
            <div className="pr-tt" style={{ marginTop: '3.6mm' }}>점프</div>
            <table>
              <thead><tr>
                <th style={{ width: '38%' }}>항목</th><th className="n">측정값</th>
                <th className="n">팀 평균</th><th style={{ width: '34%' }}>평가</th>
              </tr></thead>
              <tbody>
                {PR_JUMP_ROWS.map(({ key, label, crit, unit, dec }) => {
                  const v = computeValdValue(key, L);
                  const ev = key === 'eur' ? eurVerdict(v) : null;
                  return (
                    <tr key={key}>
                      <td>{label}<span className="pr-crit">{crit}
                        {key === 'eur' && ' · 적정 1.10~1.15 (K리그 기준)'}</span></td>
                      <td className="n">{v == null ? <span className="pr-soon">측정 전</span>
                        : <><span className="pr-num">{f(v, dec)}</span> {unit}</>}</td>
                      <td className="n"><span className="pr-num" style={{ color: PR.ink3 }}>{f(thOf(key)[1], dec)}</span></td>
                      <td>{ev
                        ? <span className="pr-gr" style={{ marginLeft: 0, color: ev.color }}>{ev.text}</span>
                        : <PrDots score={sc(key, v)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="pr-tt">근력</div>
            <table>
              <thead><tr>
                <th style={{ width: '38%' }}>항목</th><th className="n">왼쪽</th><th className="n">오른쪽</th>
                <th className="n">좌우 차이</th><th style={{ width: '28%' }}>평가</th>
              </tr></thead>
              <tbody>
                {lrRows.map(row => (
                  <tr key={row.k}>
                    <td>{row.label}<span className="pr-crit">{row.crit}</span></td>
                    <td className="n"><span className="pr-num">{f(row.l)}</span></td>
                    <td className="n"><span className="pr-num">{f(row.r)}</span></td>
                    <td className="n">
                      <span className="pr-num" style={{
                        color: (row.imb ?? 0) >= 10 ? PR.brand : PR.ink2,
                        fontWeight: (row.imb ?? 0) >= 10 ? 700 : 400,
                      }}>{f(row.imb)}</span> %
                    </td>
                    <td>{(row.imb ?? 0) >= 10
                      ? <span className="pr-gr" style={{ marginLeft: 0, color: PR.warn }}>좌우 차이 큼 · 먼저 챙기기</span>
                      : <PrDots score={sc(row.k, avgOfNullable([row.l, row.r]))} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pr-cap">
              좌우 차이가 <strong>10% 를 넘으면</strong> 한쪽에 부담이 쏠리고 있다는 신호로 보고 챙깁니다.
              {worstLr && worstLr.imb != null && worstLr.imb >= 10 && (
                <> {player.name} 선수는 {worstLr.label}에서 {(worstLr.l ?? 0) < (worstLr.r ?? 0) ? '왼쪽' : '오른쪽'}이
                  {' '}<strong style={{ color: PR.brand }}>{f(worstLr.imb)}%</strong> 약합니다.
                  5페이지에 이 부분을 위한 운동이 있습니다.</>
              )}
            </div>
            {chron.length >= 2 && (
              <>
                <div className="pr-tt">차수별 변화{' '}
                  <span style={{ fontWeight: 500, color: PR.ink3 }}>· 점선은 팀의 최고 / 평균 / 최저</span>
                </div>
                <div className="pr-grid2">
                  {PR_TREND_CHARTS.map(c => (
                    <div className="pr-ch" key={c.key}>
                      <div className="pr-cht">{c.label}{' '}
                        <span style={{ color: PR.ink3, fontWeight: 500 }}>({c.unit})</span>
                      </div>
                      <div className="pr-chs">{c.lr ? '왼쪽 / 오른쪽 따로' : '전체'}</div>
                      <PrLine h={78} labels={chronLabels} th={thOf(c.key)}
                        series={c.lr
                          ? [
                            { name: '왼쪽', color: PR.brand, vals: chron.map(r => VALD_ACCESSORS[c.key].left!(r)) },
                            { name: '오른쪽', color: PR.alt, vals: chron.map(r => VALD_ACCESSORS[c.key].right!(r)) },
                          ]
                          : [{ name: c.label, color: PR.brand, vals: chron.map(r => computeValdValue(c.key, r)) }]} />
                      <div className="pr-lg">
                        {(c.lr ? ['왼쪽', '오른쪽'] : [c.label]).map((nm, i) => (
                          <span key={nm}><i style={{ borderColor: i === 0 ? PR.brand : PR.alt }} />{nm}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ))}

      {/* 04 속도와 민첩성 */}
      {page(4, '04 · 속도와 민첩성', '달리기와 방향 전환',
        `${measured} 측정 · 시간은 짧을수록 좋습니다`,
        <>
          <div className="pr-tt" style={{ marginTop: '3.6mm' }}>달리기</div>
          <table>
            <thead><tr>
              <th style={{ width: '34%' }}>항목</th><th className="n">이번</th><th className="n">지난 측정</th>
              <th className="n">팀 평균</th><th style={{ width: '28%' }}>평가</th>
            </tr></thead>
            <tbody>
              {PR_SPRINT_ROWS.map(({ key, label, crit }) => {
                const v = L ? computeValdValue(key, L) : null;
                const pv = prevValOf(key);
                return (
                  <tr key={key}>
                    <td>{label}<span className="pr-crit">{crit}</span></td>
                    <td className="n">{v == null ? <span className="pr-soon">측정 전</span>
                      : <><span className="pr-num">{f(v, 3)}</span> 초</>}</td>
                    <td className="n"><span className="pr-num" style={{ color: PR.ink3 }}>{f(pv, 3)}</span></td>
                    <td className="n"><span className="pr-num" style={{ color: PR.ink3 }}>{f(thOf(key)[1], 2)}</span></td>
                    <td><PrDots score={sc(key, v)} /></td>
                  </tr>
                );
              })}
              {(() => {
                const fly = L ? computeValdValue('fly_10_30', L) : null;
                const flyPrev = prevValOf('fly_10_30');
                const prof = L ? sprintProfile(L.sprint_5m_time, L.sprint_10m_time, L.sprint_30m_time) : null;
                return (
                  <>
                    <tr>
                      <td>10~30m 최고 속도<span className="pr-crit">출발 가속 구간을 뺀 뒤의 속도</span></td>
                      <td className="n">{fly == null ? <span className="pr-soon">측정 전</span>
                        : <><span className="pr-num">{f(fly, 1)}</span> km/h</>}</td>
                      <td className="n"><span className="pr-num" style={{ color: PR.ink3 }}>{f(flyPrev, 1)}</span></td>
                      <td className="n"><span className="pr-num" style={{ color: PR.ink3 }}>{f(thOf('fly_10_30')[1], 1)}</span></td>
                      <td><PrDots score={sc('fly_10_30', fly)} /></td>
                    </tr>
                    <tr>
                      <td>가속도<span className="pr-crit">기록 전체에서 계산 · 최고속도와 별개인 가속 능력</span></td>
                      <td className="n">{prof == null ? <span className="pr-soon">측정 전</span>
                        : <><span className="pr-num">{f(prof.amax, 1)}</span> m/s²</>}</td>
                      <td className="n">—</td>
                      <td className="n"><span className="pr-num" style={{ color: PR.ink3 }}>13.9</span></td>
                      <td><span className="pr-soon">참고값</span></td>
                    </tr>
                  </>
                );
              })()}
            </tbody>
          </table>
          <div className="pr-cap">
            측정 전으로 표시된 항목은 이번 측정에 포함되지 않았습니다. 5·10·30m 평가는
            팀 안에서의 순위가 아니라 <strong>같은 또래 아카데미 선수들의 기록</strong>을 기준으로,
            10~30m 와 최고속도는 <strong>팀 기준</strong>으로 매깁니다. 가속도는 팀 안에서만
            비교하는 참고값입니다 — 측정 장비의 출발 위치에 따라 숫자가 달라져 다른 팀이나
            논문 값과는 비교할 수 없습니다.
          </div>

          <div className="pr-tt">나에게 맞는 달리기 속도{' '}
            <span style={{ fontWeight: 500, color: PR.ink3 }}>· 본인 측정값으로 계산한 개인 기준</span>
          </div>
          {!speed ? (
            <PrPending title="속도 측정이 아직 없습니다"
              body="MAS·MSS 측정이 들어오면 본인 기준의 훈련 속도 구간이 여기에 표시됩니다." />
          ) : (() => {
            const z = [speed.zone1_mas60, speed.zone2_mas80, speed.zone3_mas100, speed.zone4_asr20, speed.zone5_mss80];
            const rows: [string, string, string][] = [
              ['매우 가벼움', `0 ~ ${f(z[0])}`, '회복 · 가볍게 공을 다루는 훈련'],
              ['가벼움', `${f(z[0])} ~ ${f(z[1])}`, '전술 훈련에서 가장 많이 머무는 구간'],
              ['중간', `${f(z[1])} ~ ${f(z[2])}`, '경기에서 뛰는 강한 러닝 구간'],
              ['빠름', `${f(z[2])} ~ ${f(z[3])}`, '짧게 여러 번 전력 질주할 때'],
              ['최대', `${f(z[4])} ~ ${f(speed.mss)}`, '전력 질주 · 뒷허벅지를 지키기 위해 꼭 필요한 자극'],
            ];
            return (
              <>
                <PrZoneBar z={z} mss={speed.mss} />
                <table style={{ marginTop: '3mm' }}>
                  <thead><tr><th style={{ width: '20%' }}>구간</th><th className="n">속도</th><th>훈련에서 쓰이는 때</th></tr></thead>
                  <tbody>
                    {rows.map(([nm, rng, use]) => (
                      <tr key={nm}><td>{nm}</td><td className="n"><span className="pr-num">{rng}</span></td><td>{use}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="pr-cap">
                  역대 최고 기록(MAS {f(speed.mas)} · MSS {f(speed.mss)} km/h)으로 계산합니다.
                  {speedChron.length >= 2 && (
                    <> 오래 유지할 수 있는 속도는 {speedChron[0].test_round ?? '처음'}{' '}
                      <span className="pr-num">{f(speedChron[0].mas)}</span> → {speedChron[speedChron.length - 1].test_round ?? '최근'}{' '}
                      <span className="pr-num">{f(speedChron[speedChron.length - 1].mas)}</span> km/h 입니다.</>
                  )}
                </div>
              </>
            );
          })()}
        </>)}

      {/* 05 운동 */}
      {page(5, '05 · 운동', '지금 챙겨야 할 운동',
        `${measured} 측정 결과에서 나온 내용입니다`,
        rx.length === 0 ? (
          <PrPending title="처방을 만들 측정 기록이 아직 없습니다"
            body="측정이 들어오면 발견한 내용과 그에 맞는 운동이 여기에 표시됩니다." />
        ) : (
          <>
            {rx.map((fd, i) => (
              <div className="pr-rx" key={fd.key} style={i === 0 ? { marginTop: '3.6mm' } : undefined}>
                <h3>{i + 1} · {prRxText(fd).title}</h3>
                <div className="pr-rx-why">{prRxText(fd).why}</div>
                <table>
                  <thead><tr>
                    <th style={{ width: '34%' }}>운동</th><th className="c">세트</th><th className="c">횟수</th>
                    <th className="c">강도</th><th>무엇을 위해</th>
                  </tr></thead>
                  <tbody>
                    {fd.exercises.map(ex => (
                      <tr key={ex.name}>
                        <td>{ex.name}{ex.note && <span className="pr-crit">{ex.note}</span>}</td>
                        <td className="c"><span className="pr-num">{ex.sets}</span></td>
                        <td className="c"><span className="pr-num">{ex.reps}</span></td>
                        <td className="c">{ex.intensity}</td>
                        <td>{ex.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {chron.length >= 2 && (
              <>
                <div className="pr-tt">그동안의 변화</div>
                <div className="pr-strip">
                  <div className="pr-strip-h">처음 측정 → 이번 측정</div>
                  {PR_TREND_KEYS.map(({ key, label, unit }) => {
                    // chron[0] 은 체성분만 있는 행일 수 있다. 항목별로 값이 있는 회차를 찾는다.
                    const withVal = chron.filter(r => computeValdValue(key, r) != null);
                    if (withVal.length < 2) return null;
                    const a = computeValdValue(key, withVal[0]);
                    const b = computeValdValue(key, withVal[withVal.length - 1]);
                    if (a == null || b == null) return null;
                    const def = VALD_METRIC_DEFS.find(d => d.key === key);
                    const better = def?.invert ? b < a : b > a;
                    return (
                      <div key={key} style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.9 }}>
                        {label}{' '}
                        <span className="pr-num" style={{ color: PR.ink3, fontWeight: 500 }}>
                          {f(a, 1)} → {f(b, 1)} {unit}
                        </span>{' '}
                        <span style={{ color: better ? PR.ok : PR.warn, fontWeight: 700 }}>
                          {better ? '좋아짐' : '지켜볼 것'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        ))}
    </div>
  );
}

function PhysicalTabPanel({ player, record, history, bodyComp, maturity, speed, speedHistory, thresholds, teamScores, playerName, speedVals }: {
  player: PlayerWithAcwr; speedVals: SpeedAxisVals;
  record: PhysicalTestRow | null; history: PhysicalTestRow[]; bodyComp: BodyCompositionRow[];
  maturity: MaturityRow | null; speed: SpeedCustomRow | null; speedHistory: SpeedCustomTestRow[];
  thresholds: ValdThreshold[]; teamScores: Record<RadarAxisKey, number | null>[]; playerName: string;
}) {
  return (
    <div className="space-y-4">
      {/* 리포트는 document.body 아래에 붙인다. #root 안에 두면 인쇄할 때 #root 를 숨기는
          규칙에 같이 걸려 아무것도 안 찍힌다. */}
      {createPortal(
        <PhysicalReport player={player} record={record} history={history} bodyComp={bodyComp}
          maturity={maturity} speed={speed} speedHistory={speedHistory}
          thresholds={thresholds} teamScores={teamScores} speedVals={speedVals} />,
        document.body,
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="text-xs px-3 py-1.5 rounded border border-surface-secondary hover:border-brand hover:text-brand transition-colors"
        >
          리포트 PDF (A4 5장)
        </button>
      </div>
      {/* 이 탭은 6화면 분량이라 인페이지 길잡이가 없으면 맨 아래 운동 처방에 뭐가 있는지 모른 채
          스크롤해야 한다. 섹션 칩으로 목차와 이동을 함께 준다. */}
      <PhysicalSectionIndex />
      <section id="sec-radar"><PhysicalRadarSection record={record} history={history} thresholds={thresholds} teamScores={teamScores} playerName={playerName} speedVals={speedVals} /></section>
      <section id="sec-body"><BodyCompositionSection rows={bodyComp} /></section>
      <section id="sec-month"><MonthlyChangeCard bodyComp={bodyComp} maturity={maturity} /></section>
      <section id="sec-maturity"><MaturitySection row={maturity} /></section>
      <section id="sec-vald"><ValdSection record={record} /></section>
      <section id="sec-valdtrend"><ValdTrendSection history={history} thresholds={thresholds} /></section>
      <section id="sec-speed"><SpeedCustomSection row={speed} history={speedHistory} /></section>
      <section id="sec-rx"><PrescriptionSection record={record} history={history} thresholds={thresholds}
        teamScores={teamScores} maturity={maturity} speed={speed} speedVals={speedVals} /></section>
    </div>
  );
}

export function PersonalDashboard() {
  const { id: routePlayerId } = useParams<{ id?: string }>();
  const [players, setPlayers] = useState<PlayerWithAcwr[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('load');

  const [dailyData, setDailyData] = useState<TrainingDaily[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [physicalRecord, setPhysicalRecord] = useState<PhysicalTestRow | null>(null);
  const [bodyComp, setBodyComp] = useState<BodyCompositionRow[]>([]);
  const [maturity, setMaturity] = useState<MaturityRow | null>(null);
  const [speed, setSpeed] = useState<SpeedCustomRow | null>(null);
  const [speedHistory, setSpeedHistory] = useState<SpeedCustomTestRow[]>([]);
  // 팀 평균 축(스피드·지구력)을 내려면 선택 선수뿐 아니라 전원의 속도 기록이 필요하다.
  const [allSpeedRows, setAllSpeedRows] = useState<SpeedCustomTestRow[]>([]);
  const [multiMetric, setMultiMetric] = useState<Record<string, TeamAcwrSeries[]>>({});
  const [teamLoadRange, setTeamLoadRange] = useState<Record<string, { min: number; avg: number; max: number } | null>>({});
  const [valdThresholds, setValdThresholds] = useState<ValdThreshold[]>([]);
  const [physicalHistory, setPhysicalHistory] = useState<PhysicalTestRow[]>([]);
  // 선수별 측정 이력(최신순). 항목이 빠진 회차를 이전 회차로 보완하려면 최신 1건만으로는 부족하다.
  const [teamPhysicalHistory, setTeamPhysicalHistory] = useState<Map<string, PhysicalTestRow[]>>(new Map());

  useEffect(() => {
    fetchPlayersWithAcwr().then(p => {
      setPlayers(p);
      if (routePlayerId && p.some(pl => pl.id === routePlayerId)) setSelectedId(routePlayerId);
      else if (p.length > 0) setSelectedId(p[0].id);
      setLoading(false);
    });
    fetchTeamAcwrData(210).then(teamData => {
      const range = Object.fromEntries(
        METRIC_KEYS.map(({ key }) => [key, computeTeamLoadRange(teamData[key as keyof typeof teamData])]),
      );
      setTeamLoadRange(range);
    });
    fetchValdThresholds().then(setValdThresholds);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    Promise.all([
      fetchPlayerAcwrMultiMetric(selectedId, 90),
      fetchPlayerDailyData(selectedId),
      fetchPlayerMatchHistory(selectedId),
      fetchPhysicalTestRecords(),
      fetchBodyCompositionRecords(),
      fetchMaturityRecords(),
      fetchSpeedCustomRecords(),
      fetchSpeedCustomTestRows(),
    ]).then(([multi, daily, matchData, physicalRows, bodyRows, maturityRows, speedRows, speedTestRows]) => {
      if (!active) return;
      setMultiMetric(multi);
      setDailyData(daily);
      setMatches(matchData);
      const own = physicalRows.filter(r => r.player_id === selectedId).sort((a, b) => b.test_date.localeCompare(a.test_date));
      setPhysicalRecord(own[0] ?? null);
      setPhysicalHistory(own);
      const historyByPlayer = new Map<string, PhysicalTestRow[]>();
      for (const r of [...physicalRows].sort((a, b) => b.test_date.localeCompare(a.test_date))) {
        const list = historyByPlayer.get(r.player_id);
        if (list) list.push(r); else historyByPlayer.set(r.player_id, [r]);
      }
      setTeamPhysicalHistory(historyByPlayer);
      setBodyComp(bodyRows.filter(r => r.player_id === selectedId));
      setMaturity(maturityRows.find(r => r.player_id === selectedId) ?? null);
      setSpeed(speedRows.find(r => r.player_id === selectedId) ?? null);
      setSpeedHistory(speedTestRows.filter(r => r.player_id === selectedId));
      setAllSpeedRows(speedTestRows);
    });
    return () => { active = false; };
  }, [selectedId]);

  const player = players.find(p => p.id === selectedId) ?? null;
  const speedByPlayer = useMemo(() => {
    const m = new Map<string, SpeedCustomTestRow[]>();
    for (const r of allSpeedRows) {
      const list = m.get(r.player_id);
      if (list) list.push(r); else m.set(r.player_id, [r]);
    }
    return m;
  }, [allSpeedRows]);
  const teamRadarScores = players.map(p =>
    computeRadarScores(
      teamPhysicalHistory.get(p.id) ?? [], valdThresholds,
      latestSpeedVals(speedByPlayer.get(p.id) ?? []),
    ).scores,
  );
  const speedVals = useMemo(() => latestSpeedVals(speedHistory), [speedHistory]);

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">로딩 중...</div>;
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

        {player && (() => {
          const tlSeries = multiMetric.tl ?? [];
          const tlEntry = [...tlSeries].reverse().find(d => d.chronic > 0) ?? null;
          const liveAcwr = tlEntry ? +((tlEntry.acute / tlEntry.chronic).toFixed(2)) : null;
          return (
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
                    {liveAcwr != null && ` ${liveAcwr.toFixed(2)}`}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex gap-2 mb-4">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                tab === id ? 'bg-brand text-white border-brand' : 'border-surface-secondary hover:bg-surface-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {player && tab === 'load' && <LoadTab dailyData={dailyData} multiMetric={multiMetric} teamLoadRange={teamLoadRange} />}
        {/* 선수를 바꿔도 eventFilter·groupFilter·selectedKey가 이전 선수 값으로 남아 있으면,
            새 선수가 뛴 적 없는 경기 타입이 그대로 걸려 "필터된 0경기"로 표시되는 경우가 있었다.
            key로 selectedId를 넘겨 선수 전환 시 컴포넌트를 새로 마운트해 필터를 초기화한다. */}
        {tab === 'match' && <PersonalMatchTab key={selectedId} matches={matches} />}
        {player && tab === 'physical' && (
          <PhysicalTabPanel
            player={player}
            record={physicalRecord}
            history={physicalHistory}
            bodyComp={bodyComp}
            maturity={maturity}
            speed={speed}
            speedHistory={speedHistory}
            thresholds={valdThresholds}
            teamScores={teamRadarScores}
            speedVals={speedVals}
            playerName={player?.name ?? ''}
          />
        )}
      </div>
    </div>
  );
}
