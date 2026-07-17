import { useEffect, useState } from 'react';
import {
  BarChart, Bar, Legend, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  fetchPlayersWithAcwr, fetchPlayerDailyData, fetchPlayerMatchHistory,
  fetchPhysicalTestRecords, computeValdValue, VALD_METRIC_DEFS, VALD_ACCESSORS,
  fetchPlayerAcwrMultiMetric, fetchTeamAcwrData,
  fetchBodyCompositionRecords, fetchMaturityRecords, fetchSpeedCustomRecords,
} from '../lib/api';
import { StatCard } from '../components/StatCard';
import { getZoneColor, getZoneLabel } from '../utils/calculations';
import { chartColors, colors } from '../styles/colors';
import {
  AcwrComboChart, computeTeamLoadRange, METRIC_KEYS, getAcwrZone, ZONE_COLOR, ZONE_LABEL,
} from './TeamDashboard';
import type { PlayerWithAcwr, TrainingDaily, MatchData } from '../types';
import type { PhysicalTestRow, TeamAcwrSeries, BodyCompositionRow, MaturityRow, SpeedCustomRow } from '../lib/api';

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

// 같은 대회가 "K리그주니어"/"K리그 주니어"/"k리그주니어"처럼 표기가 섞여 들어오는 경우가 있어
// 공백·대소문자를 무시하고 하나로 합친다 (팀 대시보드 Match 탭과 동일한 정규화).
function normalizeEventType(et: string): string {
  return et.replace(/\s/g, '').toLowerCase();
}

function PersonalMatchTab({ matches }: { matches: MatchData[] }) {
  const [eventFilter, setEventFilter] = useState('전체');
  const [groupFilter, setGroupFilter] = useState('전체');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

// ── Physical 탭 ────────────────────────────────────────────────────────
// 좌우 차이 % — VALD 표준: (큰 쪽 - 작은 쪽) / 큰 쪽 * 100
function imbalancePercent(l: number, r: number): number {
  const base = Math.max(l, r);
  return base > 0 ? ((r - l) / base) * 100 : 0;
}
function imbalanceColor(pct: number): string {
  const abs = Math.abs(pct);
  return abs >= 10 ? colors.danger : abs >= 5 ? colors.warning : colors.safe;
}

function StatMiniCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-lg border border-surface-secondary p-3">
      <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>{label}</p>
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
          <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>성숙 단계</p>
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

function SpeedCustomSection({ row }: { row: SpeedCustomRow | null }) {
  if (!row) {
    return <div className="chart-card text-center text-text-secondary py-8">Speed custom 기록이 없습니다.</div>;
  }
  return (
    <div className="chart-card">
      <div className="chart-title">Speed Custom (MAS/MSS 기준 훈련 Zone)</div>
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

function InsightSection({ title, items, emptyText }: { title: string; items: { text: string; level: 'warning' | 'note' }[]; emptyText: string }) {
  return (
    <div>
      <div className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-1">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">✅ {emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className={`text-sm ${it.level === 'warning' ? 'text-red-700' : 'text-amber-700'}`}>
              {it.level === 'warning' ? '⚠️ ' : '· '}{it.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PhysicalInsightBox({ record, maturity, speed }: { record: PhysicalTestRow | null; maturity: MaturityRow | null; speed: SpeedCustomRow | null }) {
  // 1. VALD (EUR, 좌우 불균형)
  const valdItems: { text: string; level: 'warning' | 'note' }[] = [];
  if (record) {
    for (const key of VALD_LR_KEYS) {
      const acc = VALD_ACCESSORS[key];
      const def = VALD_METRIC_DEFS.find(d => d.key === key);
      if (!acc.left || !acc.right || !def) continue;
      const l = acc.left(record);
      const r = acc.right(record);
      if (l == null || r == null) continue;
      const imb = imbalancePercent(l, r);
      if (Math.abs(imb) >= 10) valdItems.push({ text: `${def.label} 좌우 불균형 ${imb.toFixed(1)}% — 부상 위험 높음, 편측 보강 훈련 필요`, level: 'warning' });
      else if (Math.abs(imb) >= 5) valdItems.push({ text: `${def.label} 좌우 불균형 ${imb.toFixed(1)}% — 주의 관찰`, level: 'note' });
    }
    const eur = computeValdValue('eur', record);
    if (eur != null) {
      if (eur <= 1.1) valdItems.push({ text: `EUR ${eur.toFixed(2)} — 폭발적인 힘을 위한 훈련(플라이오메트릭) 필요`, level: 'note' });
      else if (eur >= 1.15) valdItems.push({ text: `EUR ${eur.toFixed(2)} — 최대근력 훈련 비중 확대 필요`, level: 'note' });
      else valdItems.push({ text: `EUR ${eur.toFixed(2)} — 현재 훈련 비율 유지`, level: 'note' });
    }
  }

  // 2. Speed custom
  const speedItems: { text: string; level: 'warning' | 'note' }[] = [];
  if (speed) {
    const masTier = classifyMAS(speed.mas);
    speedItems.push({ text: `MAS ${speed.mas}km/h — ${masTier} 수준`, level: (masTier === '매우 낮음' || masTier === '낮음') ? 'warning' : 'note' });
    speedItems.push({ text: `MSS ${speed.mss}km/h — Zone5(MSS 80%) 기준 ${speed.zone5_mss80}km/h 이상에서 최고속주 훈련 권장`, level: 'note' });
  }

  // 3. 신체 성숙도
  const maturityItems: { text: string; level: 'warning' | 'note' }[] = [];
  if (maturity?.maturity_stage === '성장 급증기 전') maturityItems.push({ text: 'Pre-PHV(성장 급증기 전) 단계 — 코디네이션·기초 체력 위주 훈련 권장, 고강도 근력 훈련은 신중히 접근', level: 'note' });
  if (maturity?.maturity_stage === '성장 급증기') maturityItems.push({ text: 'Mid-PHV(성장 급증기) 단계 — 성장통·부상 위험이 높은 시기, 훈련 부하 조절 필요', level: 'note' });
  if (maturity?.maturity_stage === '성장 급증기 후') maturityItems.push({ text: 'Post-PHV(성장 급증기 후) 단계 — 근력·파워 훈련 비중을 늘려도 되는 시기', level: 'note' });
  if (maturity?.pah_percent != null) maturityItems.push({ text: `예측 성인 키 도달률 ${maturity.pah_percent}%`, level: 'note' });

  const hasWarning = [...valdItems, ...speedItems, ...maturityItems].some(i => i.level === 'warning');

  return (
    <div className={`chart-card border ${hasWarning ? 'border-red-200 bg-red-50' : 'border-surface-secondary'}`}>
      <div className="chart-title !mb-3">운동 처방 솔루션 및 인사이트</div>
      <div className="space-y-4">
        <InsightSection title="1. VALD (EUR · 좌우 불균형)" items={valdItems} emptyText="VALD 지표 안정적인 범위입니다." />
        <InsightSection title="2. Speed Custom" items={speedItems} emptyText="Speed 기록이 없습니다." />
        <InsightSection title="3. 신체 성숙도" items={maturityItems} emptyText="신체 성숙도 기록이 없습니다." />
      </div>
    </div>
  );
}

function PhysicalTabPanel({ record, bodyComp, maturity, speed }: {
  record: PhysicalTestRow | null; bodyComp: BodyCompositionRow[]; maturity: MaturityRow | null; speed: SpeedCustomRow | null;
}) {
  return (
    <div className="space-y-4">
      <BodyCompositionSection rows={bodyComp} />
      <MaturitySection row={maturity} />
      <ValdSection record={record} />
      <SpeedCustomSection row={speed} />
      <PhysicalInsightBox record={record} maturity={maturity} speed={speed} />
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
  const [bodyComp, setBodyComp] = useState<BodyCompositionRow[]>([]);
  const [maturity, setMaturity] = useState<MaturityRow | null>(null);
  const [speed, setSpeed] = useState<SpeedCustomRow | null>(null);
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
      fetchBodyCompositionRecords(),
      fetchMaturityRecords(),
      fetchSpeedCustomRecords(),
    ]).then(([multi, daily, matchData, physicalRows, bodyRows, maturityRows, speedRows]) => {
      if (!active) return;
      setMultiMetric(multi);
      setDailyData(daily);
      setMatches(matchData);
      const own = physicalRows.filter(r => r.player_id === selectedId).sort((a, b) => b.test_date.localeCompare(a.test_date));
      setPhysicalRecord(own[0] ?? null);
      setBodyComp(bodyRows.filter(r => r.player_id === selectedId));
      setMaturity(maturityRows.find(r => r.player_id === selectedId) ?? null);
      setSpeed(speedRows.find(r => r.player_id === selectedId) ?? null);
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
        {tab === 'physical' && <PhysicalTabPanel record={physicalRecord} bodyComp={bodyComp} maturity={maturity} speed={speed} />}
      </div>
    </div>
  );
}
