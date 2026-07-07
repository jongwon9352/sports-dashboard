import { useEffect, useMemo, useState, useRef } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, ReferenceLine, ReferenceArea, Cell,
} from 'recharts';
import { fetchTeamAcwrData, type TeamAcwrSeries } from '../lib/api';
import MatchTab from './MatchTab';

// ── 공통 상수 ──────────────────────────────────────────────────────────
const METRIC_KEYS = [
  { key: 'tl',     label: 'TL',     unit: ' AU' },
  { key: 'td',     label: 'TD',     unit: ' m'  },
  { key: 'hsr',    label: 'HSR',    unit: ' m'  },
  { key: 'sprint', label: 'Sprint', unit: ' m'  },
  { key: 'acd',    label: 'ACD',    unit: ''    },
] as const;

const ACWR_COLOR = '#A42843';

const ACWR_THRESHOLDS = {
  undertraining: 0.8,
  caution:       1.3,
  danger:        1.5,
  highDanger:    2.0,
};

const ACWR_THRESHOLD_TABLE = [
  { range: '< 0.8',     zone: '과소훈련',         color: '#2563eb', basis: '탈훈련 위험, 체력 감소',                        ref: 'Gabbett 2016 (BJSM)' },
  { range: '0.8 ~ 1.3', zone: '최적 (Sweet Spot)', color: '#16a34a', basis: '부상 위험 최소, 적응 최대',                     ref: 'Gabbett 2016; Hulin et al. 2016' },
  { range: '1.3 ~ 1.5', zone: '주의',              color: '#d97706', basis: '부상 위험 증가 시작',                           ref: 'Malone et al. 2017' },
  { range: '> 1.5',     zone: '위험',              color: '#dc2626', basis: '부상 위험 유의하게 증가 (odds ratio ~2)',        ref: 'Hulin et al. 2014, 2016' },
  { range: '> 2.0',     zone: '고위험',            color: '#7f1d1d', basis: '급격한 부하 스파이크, 즉각 조정 필요',           ref: 'Murray et al. 2017 (EWMA)' },
];

const METRIC_THRESHOLDS: Record<string, Thresholds> = {
  tl:     { caution: 1.0, danger: 1.5, highDanger: 2.0, basis: 'Foster 1998 원 공식' },
  td:     { caution: 1.3, danger: 1.8, highDanger: 2.2, basis: 'GPS 거리 특성 (변동 작음)' },
  hsr:    { caution: 0.8, danger: 1.2, highDanger: 1.6, basis: '세션 간 편차 큼' },
  sprint: { caution: 0.8, danger: 1.2, highDanger: 1.6, basis: 'HSR과 동일 기준' },
  acd:    { caution: 1.0, danger: 1.5, highDanger: 2.0, basis: 'TL 기준 준용' },
};

// ── Zone 시스템 ────────────────────────────────────────────────────────
interface Thresholds { caution: number; danger: number; highDanger: number; basis: string; }
type ZoneType = 'safe' | 'caution' | 'danger' | 'high-danger';

function getZone(val: number | null, t: Thresholds): ZoneType {
  if (val === null) return 'safe';
  if (val >= t.highDanger) return 'high-danger';
  if (val >= t.danger)     return 'danger';
  if (val >= t.caution)    return 'caution';
  return 'safe';
}

function getAcwrZone(val: number | null): ZoneType {
  if (val === null) return 'safe';
  if (val >= ACWR_THRESHOLDS.highDanger) return 'high-danger';
  if (val >= ACWR_THRESHOLDS.danger)     return 'danger';
  if (val >= ACWR_THRESHOLDS.caution)    return 'caution';
  if (val < ACWR_THRESHOLDS.undertraining) return 'caution'; // 과소훈련도 주의
  return 'safe';
}

const ZONE_COLOR: Record<ZoneType, string> = {
  safe: '#16a34a', caution: '#d97706', danger: '#dc2626', 'high-danger': '#7f1d1d',
};
const ZONE_LABEL: Record<ZoneType, string> = {
  safe: '안전', caution: '주의', danger: '위험', 'high-danger': '고위험',
};
const ZONE_BADGE: Record<ZoneType, string> = {
  safe:         'bg-emerald-100 text-emerald-800',
  caution:      'bg-amber-100 text-amber-800',
  danger:       'bg-red-100 text-red-800',
  'high-danger':'bg-red-200 text-red-900',
};

// ── 계산 함수 ──────────────────────────────────────────────────────────
interface MonotonySeries { date: string; monotony: number | null; daily: number; }

function computeMonotony(series: TeamAcwrSeries[], window = 7): MonotonySeries[] {
  return series.map((item, i) => {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1).map(s => s.daily);
    if (slice.length < 2) return { date: item.date, monotony: null, daily: item.daily };
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    // sd=0: 완전히 균일한 부하 → 이론상 무한대 Monotony이나 실제로는 null 처리
    return { date: item.date, monotony: sd > 0 ? +(mean / sd).toFixed(2) : null, daily: item.daily };
  });
}

function computeWeeklyStrain(series: TeamAcwrSeries[]) {
  const weeks = new Map<string, number[]>();
  for (const item of series) {
    const d = new Date(item.date);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = mon.toISOString().split('T')[0];
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(item.daily);
  }
  // 날짜순 정렬 후 마지막 6주 선택
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([week, vals]) => {
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const monotony = sd > 0 ? mean / sd : 0;
    const strain = Math.round(sum * monotony);
    const d = new Date(week);
    const sun = new Date(d); sun.setDate(d.getDate() + 6);
    const label = `${d.getMonth() + 1}/${d.getDate()}~${sun.getMonth() + 1}/${sun.getDate()}`;
    return { week, label, strain, monotony: +monotony.toFixed(2), sum: Math.round(sum) };
  });
}

// 팀 자체 부하 기준(정상 범위) — Chronic(장기 부하) 히스토리의 min/avg/max.
// EWMA가 아직 수렴하지 않은 초반 구간(10일)은 제외.
function computeTeamLoadRange(series: TeamAcwrSeries[], skipDays = 10) {
  const vals = series.slice(skipDays).map(d => d.chronic).filter(v => v > 0);
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, avg, max };
}

// 주 단위 Monotony 히스토리 (일별 시리즈를 월요일 기준 주로 묶어 mean/sd 계산)
interface WeeklyMonotony { week: string; label: string; monotony: number | null; complete: boolean; }

function computeWeeklyMonotonyHistory(series: TeamAcwrSeries[]): WeeklyMonotony[] {
  const weeks = new Map<string, number[]>();
  for (const item of series) {
    const d = new Date(item.date);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = mon.toISOString().split('T')[0];
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(item.daily);
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, vals]) => {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const d = new Date(week);
    return {
      week,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      monotony: sd > 0 ? +(mean / sd).toFixed(2) : null,
      complete: vals.length >= 6,
    };
  });
}

// 완결된(7일 다 채워진) 주차만으로 팀 자체 Monotony 정상 범위 계산
function computeTeamMonotonyRange(weeks: WeeklyMonotony[]) {
  const vals = weeks.filter(w => w.complete && w.monotony !== null).map(w => w.monotony!);
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
  return { min, avg, max };
}

// ── 공통 유틸 ──────────────────────────────────────────────────────────
const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; };

// ── 차트용 모듈-레벨 서브컴포넌트 ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AcwrDot({ cx, cy, payload }: any) {
  const v = payload?.acwr;
  if (v == null || !cx || !cy) return null;
  const color = v >= 2.0 ? '#7f1d1d' : v >= 1.5 ? '#dc2626' : v >= 1.3 ? '#d97706' : v < 0.8 ? '#2563eb' : '#16a34a';
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StrainBarShape({ x, y, width, height, value, payload }: any) {
  if (!width) return null;
  const DANGER = 6000;
  const isOver = payload.strain >= DANGER;
  const fill = isOver ? 'rgba(220,38,38,0.75)' : payload.strain >= DANGER * 0.85 ? 'rgba(245,158,11,0.75)' : 'rgba(124,58,237,0.65)';
  return (
    <g>
      <rect x={x} y={y} width={width} height={height || 0} fill={fill} rx={3} />
      {value > 0 && (
        <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontFamily="DM Mono"
          fill={isOver ? '#dc2626' : '#374151'} fontWeight={isOver ? '700' : '400'}>
          {value.toLocaleString()}
        </text>
      )}
    </g>
  );
}

// ── ACWR 콤보 차트 (2패널) ─────────────────────────────────────────────
function AcwrComboChart({ title, data, unit, teamRange }: {
  title: string; data: TeamAcwrSeries[]; unit?: string;
  teamRange: { min: number; avg: number; max: number } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last28 = data.slice(-28);
  const chartWidth = Math.max(last28.length * 48, 600);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; }, [data]);

  const chartData = last28.map(d => ({
    ...d,
    acwr: d.chronic > 0 ? +((d.acute / d.chronic).toFixed(2)) : null,
  }));

  const vals = chartData.flatMap(d => [d.daily, d.acute, d.chronic]).filter(v => v > 0);
  const yMax = Math.ceil(Math.max(...vals, teamRange?.max ?? 0, 1) * 1.2);
  const todayStr = chartData[chartData.length - 1]?.date ?? '';
  const loadNames: Record<string, string> = { daily: 'Daily', acute: 'Acute(EWMA)', chronic: 'Chronic(EWMA)' };

  const latestAcute = [...chartData].reverse().find(d => d.acute > 0)?.acute ?? null;
  const rangeStatus = teamRange && latestAcute != null
    ? (latestAcute < teamRange.min ? 'below' : latestAcute > teamRange.max ? 'above' : 'within')
    : null;
  const rangeBadge = rangeStatus === 'within'
    ? { text: '부하는 팀 정상범위 내', bg: '#EAF3DE', color: '#3B6D11' }
    : rangeStatus === 'above'
    ? { text: '부하가 팀 최대치 초과', bg: '#FCEBEB', color: '#A32D2D' }
    : rangeStatus === 'below'
    ? { text: '부하가 팀 최소치 미만', bg: '#E6F1FB', color: '#0C447C' }
    : null;

  return (
    <div className="chart-card mb-4">
      <div className="flex items-center justify-center gap-2 mb-0 flex-wrap">
        <div className="chart-title !mb-0">{title}</div>
        {rangeBadge && (
          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: rangeBadge.bg, color: rangeBadge.color }}>
            {rangeBadge.text}
          </span>
        )}
      </div>
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ width: chartWidth }}>
          {/* 상단: Daily 바 + Acute/Chronic EWMA 라인 + 팀 자체 정상범위(Chronic 기준) */}
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 20, bottom: 0, left: 54 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmt} tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} domain={[0, yMax]} width={44} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any, name: any) => [`${Math.round(Number(v)).toLocaleString()}${unit || ''}`, loadNames[name] ?? name]}
                labelFormatter={(d: any) => fmt(String(d))} contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                formatter={(val: string) => loadNames[val] ?? val} />
              {teamRange && (
                <ReferenceArea y1={teamRange.min} y2={teamRange.max} fill="#97C459" fillOpacity={0.18}
                  stroke="#639922" strokeDasharray="4 3" strokeOpacity={0.6} />
              )}
              {teamRange && (
                <ReferenceLine y={teamRange.avg} stroke="#3B6D11" strokeDasharray="3 2" strokeWidth={1}
                  label={{ value: `팀 평균 ${Math.round(teamRange.avg).toLocaleString()}`, position: 'insideBottomLeft', fontSize: 8, fill: '#3B6D11' }} />
              )}
              <ReferenceLine x={todayStr} stroke="#374151" strokeWidth={1.5} strokeDasharray="3 3"
                label={{ value: '오늘', position: 'insideTopLeft', fontSize: 9, fill: '#374151' }} />
              <Bar dataKey="daily" name="daily" fill="rgba(100,149,237,0.55)" barSize={14} radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="chronic" name="chronic" stroke="#008c7e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="acute"   name="acute"   stroke="#e85d3a" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          {teamRange && (
            <div className="text-center" style={{ fontSize: 9, color: '#3B6D11', marginTop: -4 }}>
              녹색 밴드 = 우리 팀 장기 부하(Chronic) 정상범위 {Math.round(teamRange.min).toLocaleString()}~{Math.round(teamRange.max).toLocaleString()}{unit}
            </div>
          )}

          {/* 하단: ACWR 비율 라인 + 구간 색상 배경 */}
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 24, left: 54 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} domain={[0, 2.5]} width={44}
                ticks={[0, 0.8, 1.3, 1.5, 2.0, 2.5]} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any) => [v != null ? v : '-', 'ACWR']}
                labelFormatter={(d: any) => fmt(String(d))} contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <ReferenceArea y1={0}   y2={0.8} fill="#dbeafe" fillOpacity={0.5} />
              <ReferenceArea y1={0.8} y2={1.3} fill="#dcfce7" fillOpacity={0.5} />
              <ReferenceArea y1={1.3} y2={1.5} fill="#fef9c3" fillOpacity={0.6} />
              <ReferenceArea y1={1.5} y2={2.0} fill="#fee2e2" fillOpacity={0.6} />
              <ReferenceArea y1={2.0} y2={2.5} fill="#fecaca" fillOpacity={0.7} />
              <ReferenceLine y={1.5} stroke="#dc2626" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: '1.5 위험', position: 'insideTopRight', fontSize: 8, fill: '#dc2626' }} />
              <ReferenceLine y={1.3} stroke="#d97706" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: '1.3 주의', position: 'insideTopRight', fontSize: 8, fill: '#d97706' }} />
              <ReferenceLine y={0.8} stroke="#2563eb" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: '0.8 최저', position: 'insideBottomRight', fontSize: 8, fill: '#2563eb' }} />
              <ReferenceLine x={todayStr} stroke="#374151" strokeWidth={1.5} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="acwr" stroke={ACWR_COLOR} strokeWidth={2.5}
                dot={<AcwrDot />} activeDot={{ r: 5 }} connectNulls={false}
                label={({ x, y, value }: any) => value != null // eslint-disable-line @typescript-eslint/no-explicit-any
                  ? <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fontFamily="DM Mono" fontWeight="700" fill={ACWR_COLOR}>{value}</text>
                  : null} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Monotony 차트 (주간 막대 · 문헌 구간 음영 + 팀 자체 정상범위) ──────
function MonotonyChart({ title, series, metricKey }: { title: string; series: TeamAcwrSeries[]; metricKey: string }) {
  const t = METRIC_THRESHOLDS[metricKey];
  const weeks = useMemo(() => computeWeeklyMonotonyHistory(series).slice(-10), [series]);
  const teamRange = useMemo(() => computeTeamMonotonyRange(weeks), [weeks]);

  const last = [...weeks].reverse().find(w => w.monotony !== null) ?? null;
  const lastVal = last?.monotony ?? null;
  const zone = getZone(lastVal, t);

  const yMax = Math.ceil(Math.max(...weeks.map(w => w.monotony ?? 0), t.highDanger * 1.1) * 10) / 10;

  const compareText = lastVal === null || !teamRange ? null
    : lastVal > t.danger && lastVal <= teamRange.max
    ? `문헌 기준(${t.danger})보다 높지만 우리 팀 정상범위(${teamRange.min}~${teamRange.max})안입니다.`
    : lastVal > teamRange.max
    ? `문헌 기준은 물론 우리 팀 역대 범위(최대 ${teamRange.max})도 넘어섰습니다.`
    : `우리 팀 평균(${teamRange.avg}) 대비 ${lastVal > teamRange.avg ? '높은' : '낮은'} 수준입니다.`;

  return (
    <div className="chart-card mb-4">
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="font-mono font-bold" style={{ fontSize: 26, color: ZONE_COLOR[zone] }}>{lastVal ?? '-'}</span>
        <div className="chart-title !mb-0">{title}</div>
        {lastVal !== null && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${ZONE_BADGE[zone]}`}>{ZONE_LABEL[zone]}</span>
        )}
      </div>
      {compareText && (
        <div className="text-center text-xs text-text-secondary mb-2">{compareText}</div>
      )}
      <div className="flex items-center justify-center gap-3 flex-wrap mb-1" style={{ fontSize: 9 }}>
        <span style={{ color: '#dc2626' }}>■ 문헌 위험 {t.danger}~{t.highDanger}</span>
        <span style={{ color: '#7f1d1d' }}>■ 문헌 고위험 &gt;{t.highDanger}</span>
        {teamRange && <span style={{ color: '#3B6D11' }}>┅ 팀 정상범위 {teamRange.min}~{teamRange.max}</span>}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={weeks} margin={{ top: 20, right: 20, bottom: 4, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11, fontFamily: 'DM Mono' }} domain={[0, yMax]} width={40} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip formatter={(v: any) => [v != null ? v : '-', 'Monotony']} contentStyle={{ fontFamily: 'DM Mono', fontSize: 12 }} />
          <ReferenceArea y1={t.danger} y2={t.highDanger} fill="#fee2e2" fillOpacity={0.6} />
          <ReferenceArea y1={t.highDanger} y2={yMax} fill="#fecaca" fillOpacity={0.7} />
          <ReferenceArea y1={t.caution} y2={t.danger} fill="#fef9c3" fillOpacity={0.5} />
          {teamRange && (
            <ReferenceArea y1={teamRange.min} y2={teamRange.max} fill="none" stroke="#639922" strokeDasharray="4 3" />
          )}
          <Bar dataKey="monotony" radius={[3, 3, 0, 0]} barSize={28}>
            {weeks.map((w, i) => (
              <Cell key={i} fill={ZONE_COLOR[getZone(w.monotony, t)]} fillOpacity={i === weeks.length - 1 ? 1 : 0.7} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Strain 차트 & 테이블 ───────────────────────────────────────────────
function StrainBarChart({ weeklyData }: { weeklyData: ReturnType<typeof computeWeeklyStrain> }) {
  const DANGER_LINE = 6000;
  const maxStrain = Math.max(...weeklyData.map(d => d.strain), DANGER_LINE);
  const yMax = Math.ceil(maxStrain * 1.2 / 1000) * 1000;
  return (
    <div className="chart-card">
      <div className="chart-title text-center mb-0.5">TL Strain — 주별 추이</div>
      <div className="text-center mb-2" style={{ fontSize: 10, color: '#6b7280' }}>
        Strain = 주간 합산 × Monotony · 위험 기준 6,000 AU (Alexiou &amp; Coutts, 2008)
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={weeklyData} margin={{ top: 28, right: 16, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11, fontFamily: 'DM Mono' }} domain={[0, yMax]} width={50}
            tickFormatter={v => v.toLocaleString()} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip formatter={(v: any) => [Number(v).toLocaleString() + ' AU', 'TL Strain']}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 12 }} />
          <ReferenceLine y={DANGER_LINE} stroke="#dc2626" strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: '위험 6,000', position: 'insideTopRight', fontSize: 9, fill: '#dc2626' }} />
          <Bar dataKey="strain" name="TL Strain" barSize={32} shape={<StrainBarShape />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function StrainTable({ metrics }: { metrics: { key: string; label: string; monotony: MonotonySeries[]; unit: string }[] }) {
  const rows = metrics.map(({ key, label, monotony, unit }) => {
    const last7 = monotony.slice(-7);
    const weeklySum = last7.reduce((a, b) => a + b.daily, 0);
    const lastM = [...last7].reverse().find(d => d.monotony !== null)?.monotony ?? null;
    const strain = lastM !== null ? Math.round(weeklySum * lastM) : null;
    const zone = getZone(lastM, METRIC_THRESHOLDS[key]);
    return { key, label, weeklySum: Math.round(weeklySum), monotony: lastM, strain, zone, unit };
  });
  return (
    <div className="chart-card">
      <div className="chart-title mb-3">이번 주 Strain 현황 (최근 7일)</div>
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e8eaf0' }}>
            {['지표', '주간 합산', 'Monotony', 'Strain', '상태'].map(h => (
              <th key={h} className="py-1.5 px-2 text-left text-text-secondary font-semibold" style={{ fontSize: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td className="py-1.5 px-2 font-bold">{row.label}</td>
              <td className="py-1.5 px-2 font-mono">{row.weeklySum.toLocaleString()}{row.unit}</td>
              <td className="py-1.5 px-2 font-mono" style={{ color: row.monotony !== null ? ZONE_COLOR[row.zone] : '#9ca3af' }}>
                {row.monotony ?? '-'}
              </td>
              <td className="py-1.5 px-2 font-mono font-bold">{row.strain !== null ? row.strain.toLocaleString() : '-'}</td>
              <td className="py-1.5 px-2">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ZONE_BADGE[row.zone]}`}>{ZONE_LABEL[row.zone]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-text-secondary" style={{ fontSize: 10 }}>
        * TD·HSR·Sprint·ACD의 Strain 수치는 단위가 달라 절대값보다 Monotony 상태를 주로 참고하세요.
      </p>
    </div>
  );
}

// ── 공통 UI 컴포넌트 ───────────────────────────────────────────────────
type InsightItem = { label: string; val: number; zone: ZoneType };

function InsightBox({ items, metricName }: { items: InsightItem[]; metricName: string }) {
  const warnings = items.filter(i => i.zone === 'danger' || i.zone === 'high-danger');
  const cautions = items.filter(i => i.zone === 'caution');
  if (warnings.length === 0 && cautions.length === 0) {
    return (
      <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}>
        ✅ 모든 지표 안전 구간 — 현재 {metricName} 수치가 적절하게 유지되고 있습니다.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border px-4 py-3" style={{ background: '#fefce8', borderColor: '#fcd34d', color: '#78350f' }}>
      <div className="font-bold text-sm mb-1">⚠️ 주의 필요 (오늘 기준)</div>
      <ul className="text-xs space-y-0.5" style={{ paddingLeft: 14 }}>
        {warnings.map(i => (
          <li key={i.label}>
            <strong>{i.label} {metricName} {i.val}</strong> — {i.zone === 'high-danger' ? '고위험' : '위험'} 구간. 즉시 확인 필요
          </li>
        ))}
        {cautions.map(i => (
          <li key={i.label} style={{ color: '#92400e' }}>
            {metricName === 'ACWR' && i.val < ACWR_THRESHOLDS.undertraining
              ? `${i.label} ${metricName} ${i.val} — 과소훈련 구간 (기준 <${ACWR_THRESHOLDS.undertraining}). 체력 저하 위험`
              : `${i.label} ${metricName} ${i.val} — 주의 구간`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusCards({ items, subtitle }: { items: { label: string; val: number | null; zone: ZoneType }[]; subtitle: string }) {
  return (
    <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
      {items.map(({ label, val, zone }) => (
        <div key={label} className="chart-card !mb-0 !p-3">
          <div className="text-text-secondary mb-1" style={{ fontSize: 10 }}>{label} {subtitle}</div>
          <div className="font-bold font-mono mb-1" style={{ fontSize: 22, color: ZONE_COLOR[zone] }}>{val ?? '-'}</div>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ZONE_BADGE[zone]}`}>{ZONE_LABEL[zone]}</span>
        </div>
      ))}
    </div>
  );
}

function ThresholdTable({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <div className="mb-4">
      <button onClick={onToggle} className="text-xs text-text-secondary underline mb-2">
        {show ? '▲ 지표별 임계값 기준 숨기기' : '▼ 지표별 임계값 기준 보기'}
      </button>
      {show && (
        <div className="chart-card">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8eaf0' }}>
                {['지표', '안전', '주의', '위험', '고위험', '근거'].map(h => (
                  <th key={h} className="py-1.5 px-2 text-left text-text-secondary font-semibold" style={{ fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_KEYS.map(({ key, label }) => {
                const t = METRIC_THRESHOLDS[key];
                return (
                  <tr key={key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td className="py-1.5 px-2 font-bold">{label}</td>
                    <td className="py-1.5 px-2 font-mono" style={{ color: '#16a34a' }}>{'<'}{t.caution}</td>
                    <td className="py-1.5 px-2 font-mono" style={{ color: '#d97706' }}>{t.caution}~{t.danger}</td>
                    <td className="py-1.5 px-2 font-mono" style={{ color: '#dc2626' }}>{t.danger}~{t.highDanger}</td>
                    <td className="py-1.5 px-2 font-mono" style={{ color: '#7f1d1d' }}>{'>'}{t.highDanger}</td>
                    <td className="py-1.5 px-2 text-text-secondary" style={{ fontSize: 10 }}>{t.basis}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AcwrThresholdTable({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <div className="mb-4">
      <button onClick={onToggle}
        className="text-xs text-text-secondary border border-surface-secondary rounded px-3 py-1 hover:bg-surface-secondary transition-colors">
        {show ? '▲' : '▼'} EWMA ACWR 임계값 기준 보기
      </button>
      {show && (
        <div className="chart-card mt-2 overflow-x-auto">
          <table className="w-full text-xs" style={{ fontFamily: 'DM Mono' }}>
            <thead>
              <tr className="border-b border-surface-secondary">
                {['ACWR 범위', '구간', '의미', '참고문헌'].map(h => (
                  <th key={h} className="py-1.5 px-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACWR_THRESHOLD_TABLE.map(row => (
                <tr key={row.range} className="border-b border-surface-secondary last:border-0">
                  <td className="py-1.5 px-3 font-bold"     style={{ color: row.color }}>{row.range}</td>
                  <td className="py-1.5 px-3 font-semibold" style={{ color: row.color }}>{row.zone}</td>
                  <td className="py-1.5 px-3 text-text-secondary">{row.basis}</td>
                  <td className="py-1.5 px-3 text-text-secondary">{row.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────
type MetricData = { tl: TeamAcwrSeries[]; td: TeamAcwrSeries[]; hsr: TeamAcwrSeries[]; sprint: TeamAcwrSeries[]; acd: TeamAcwrSeries[] };

export function TeamDashboard() {
  const [data, setData] = useState<MetricData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'acwr' | 'monotony' | 'match'>('acwr');
  const [showThreshold, setShowThreshold] = useState(false);
  const [showAcwrThreshold, setShowAcwrThreshold] = useState(false);

  useEffect(() => {
    fetchTeamAcwrData(210)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  // Monotony 시리즈 + 최신값 + Insight 아이템 (단일 useMemo)
  const monotonyState = useMemo(() => {
    if (!data) return null;
    const series = {
      tl:     computeMonotony(data.tl),
      td:     computeMonotony(data.td),
      hsr:    computeMonotony(data.hsr),
      sprint: computeMonotony(data.sprint),
      acd:    computeMonotony(data.acd),
    };
    const lastVal = (s: MonotonySeries[]) => [...s].reverse().find(d => d.monotony !== null)?.monotony ?? null;
    const latest: Record<string, number | null> = Object.fromEntries(
      METRIC_KEYS.map(({ key }) => [key, lastVal(series[key as keyof typeof series])])
    );
    const items = METRIC_KEYS.map(({ key, label }) => ({
      label, val: latest[key], zone: getZone(latest[key], METRIC_THRESHOLDS[key]),
    })).filter(i => i.val !== null) as InsightItem[];
    return { series, latest, items };
  }, [data]);

  // ACWR 최신값 + Insight 아이템 (단일 useMemo)
  const acwrState = useMemo(() => {
    if (!data) return null;
    const calc = (s: TeamAcwrSeries[]) => {
      const last = [...s].reverse().find(d => d.chronic > 0);
      return last ? +((last.acute / last.chronic).toFixed(2)) : null;
    };
    const vals = {
      tl: calc(data.tl), td: calc(data.td), hsr: calc(data.hsr),
      sprint: calc(data.sprint), acd: calc(data.acd),
    };
    const items = METRIC_KEYS.map(({ key, label }) => ({
      label, val: vals[key as keyof typeof vals], zone: getAcwrZone(vals[key as keyof typeof vals]),
    })).filter(i => i.val !== null) as InsightItem[];
    return { vals, items };
  }, [data]);

  // 팀 자체 장기 부하(Chronic) 정상범위 — ACWR 콤보 차트에 겹쳐 표시
  const teamLoadRange = useMemo(() => {
    if (!data) return null;
    return Object.fromEntries(
      METRIC_KEYS.map(({ key }) => [key, computeTeamLoadRange(data[key as keyof MetricData])])
    ) as Record<string, ReturnType<typeof computeTeamLoadRange>>;
  }, [data]);

  // Strain 데이터
  const weeklyStrain = useMemo(() => data ? computeWeeklyStrain(data.tl) : [], [data]);
  const strainMetrics = useMemo(() => monotonyState
    ? METRIC_KEYS.map(({ key, label, unit }) => ({ key, label, monotony: monotonyState.series[key as keyof typeof monotonyState.series], unit }))
    : [], [monotonyState]);

  const tabBtn = (id: 'acwr' | 'monotony' | 'match', label: string) => (
    <button onClick={() => setTab(id)}
      className={`px-3 py-1.5 text-sm rounded border transition-colors ${tab === id ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'}`}>
      {label}
    </button>
  );

  const loadingEl = loading
    ? <div className="text-text-secondary text-center py-16">Loading...</div>
    : error
    ? <div className="text-red-500 text-center py-16">데이터를 불러오지 못했습니다. 네트워크를 확인하세요.</div>
    : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="sec-title !mb-0">팀 대시보드</div>
        {tabBtn('acwr', 'ACWR')}
        {tabBtn('monotony', 'MONOTONY')}
        {tabBtn('match', 'MATCH')}
      </div>

      {/* ── ACWR 탭 ── */}
      {tab === 'acwr' && (
        <>
          <p className="text-xs text-text-secondary mb-3">
            3학년 선수 팀 평균 기준 · EWMA (Acute λ=0.75, Chronic λ=0.069) · 최근 4주 · 하단 패널 = ACWR 비율
          </p>
          {loadingEl ?? (data && acwrState ? (
            <>
              <InsightBox items={acwrState.items} metricName="ACWR" />

              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">오늘 기준 ACWR 현황</div>
              <StatusCards subtitle="ACWR"
                items={METRIC_KEYS.map(({ key, label }) => ({
                  label, val: acwrState.vals[key as keyof typeof acwrState.vals],
                  zone: getAcwrZone(acwrState.vals[key as keyof typeof acwrState.vals]),
                }))} />

              <AcwrThresholdTable show={showAcwrThreshold} onToggle={() => setShowAcwrThreshold(v => !v)} />

              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">일별 ACWR 흐름</div>
              <div className="space-y-2">
                {METRIC_KEYS.map(({ key, label, unit }) => (
                  <AcwrComboChart key={key} title={`${label} / ACWR`} data={data[key as keyof MetricData]} unit={unit || undefined}
                    teamRange={teamLoadRange?.[key] ?? null} />
                ))}
              </div>
            </>
          ) : null)}
        </>
      )}

      {/* ── MONOTONY 탭 ── */}
      {tab === 'monotony' && (
        <>
          <p className="text-xs text-text-secondary mb-4">
            3학년 선수 팀 평균 기준 · 주 단위 Monotony(평균/표준편차) · 지표별 차등 임계값 + 팀 자체 정상범위 · 최근 10주
          </p>
          {loadingEl ?? (monotonyState ? (
            <>
              <InsightBox items={monotonyState.items} metricName="Monotony" />

              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">오늘 기준 Monotony 현황</div>
              <StatusCards subtitle="Monotony"
                items={METRIC_KEYS.map(({ key, label }) => ({
                  label, val: monotonyState.latest[key] ?? null,
                  zone: getZone(monotonyState.latest[key] ?? null, METRIC_THRESHOLDS[key]),
                }))} />

              <ThresholdTable show={showThreshold} onToggle={() => setShowThreshold(v => !v)} />

              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">주간 Monotony 흐름</div>
              {data && METRIC_KEYS.map(({ key, label }) => (
                <MonotonyChart key={key} title={`${label} Monotony`}
                  series={data[key as keyof MetricData]} metricKey={key} />
              ))}

              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 mt-2">Strain 모니터링</div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <StrainBarChart weeklyData={weeklyStrain} />
                <StrainTable metrics={strainMetrics} />
              </div>
            </>
          ) : null)}
        </>
      )}

      {/* ── MATCH 탭 ── */}
      {tab === 'match' && <MatchTab />}
    </div>
  );
}
