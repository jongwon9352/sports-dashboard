import { useEffect, useMemo, useState, useRef } from 'react';
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import { fetchTeamAcwrData, type TeamAcwrSeries } from '../lib/api';

// ── ACWR 색상 ──────────────────────────────────────────────────────────
const ACWR_COLORS = {
  daily: 'rgba(100, 149, 237, 0.6)',
  acute: 'rgba(255, 99, 71, 0.4)',
  chronic: 'rgba(0, 140, 126, 0.3)',
  acwr: '#A42843',
};

// ── EWMA ACWR 임계값 (Gabbett 2016; Hulin et al. 2016; Murray et al. 2017) ──
const ACWR_THRESHOLDS = {
  undertraining: 0.8,   // 미만: 과소훈련 (탈훈련 위험)
  sweetSpotLow:  0.8,   // 최적 구간 하한
  sweetSpotHigh: 1.3,   // 최적 구간 상한
  caution:       1.3,   // 주의 구간 시작
  danger:        1.5,   // 위험 구간 시작 (부상 위험 유의하게 증가)
  highDanger:    2.0,   // 고위험 구간 (극도의 스파이크)
};

const ACWR_THRESHOLD_TABLE = [
  { range: '< 0.8',     zone: '과소훈련', color: '#2563eb', basis: '탈훈련 위험, 체력 감소', ref: 'Gabbett 2016 (BJSM)' },
  { range: '0.8 ~ 1.3', zone: '최적 (Sweet Spot)', color: '#16a34a', basis: '부상 위험 최소, 적응 최대', ref: 'Gabbett 2016; Hulin et al. 2016' },
  { range: '1.3 ~ 1.5', zone: '주의', color: '#d97706', basis: '부상 위험 증가 시작', ref: 'Malone et al. 2017' },
  { range: '> 1.5',     zone: '위험', color: '#dc2626', basis: '부상 위험 유의하게 증가 (odds ratio ~2)', ref: 'Hulin et al. 2014, 2016' },
  { range: '> 2.0',     zone: '고위험', color: '#7f1d1d', basis: '급격한 부하 스파이크, 즉각 조정 필요', ref: 'Murray et al. 2017 (EWMA)' },
];

function getAcwrZone(val: number | null): ZoneType {
  if (val === null) return 'safe';
  if (val >= ACWR_THRESHOLDS.highDanger) return 'high-danger';
  if (val >= ACWR_THRESHOLDS.danger) return 'danger';
  if (val >= ACWR_THRESHOLDS.caution) return 'caution';
  if (val < ACWR_THRESHOLDS.undertraining) return 'caution'; // 과소훈련도 주의
  return 'safe';
}

// ── 지표별 Monotony 임계값 ─────────────────────────────────────────────
interface Thresholds { caution: number; danger: number; highDanger: number; basis: string; }

const METRIC_THRESHOLDS: Record<string, Thresholds> = {
  tl:     { caution: 1.0, danger: 1.5, highDanger: 2.0, basis: 'Foster 1998 원 공식' },
  td:     { caution: 1.3, danger: 1.8, highDanger: 2.2, basis: 'GPS 거리 특성 (변동 작음)' },
  hsr:    { caution: 0.8, danger: 1.2, highDanger: 1.6, basis: '세션 간 편차 큼' },
  sprint: { caution: 0.8, danger: 1.2, highDanger: 1.6, basis: 'HSR과 동일 기준' },
  acd:    { caution: 1.0, danger: 1.5, highDanger: 2.0, basis: 'TL 기준 준용' },
};

type ZoneType = 'safe' | 'caution' | 'danger' | 'high-danger';

function getZone(val: number | null, t: Thresholds): ZoneType {
  if (val === null) return 'safe';
  if (val >= t.highDanger) return 'high-danger';
  if (val >= t.danger) return 'danger';
  if (val >= t.caution) return 'caution';
  return 'safe';
}

const ZONE_COLOR: Record<ZoneType, string> = {
  safe: '#16a34a', caution: '#d97706', danger: '#dc2626', 'high-danger': '#7f1d1d',
};
const ZONE_LABEL: Record<ZoneType, string> = {
  safe: '안전', caution: '주의', danger: '위험', 'high-danger': '고위험',
};
const ZONE_BADGE: Record<ZoneType, string> = {
  safe: 'bg-emerald-100 text-emerald-800',
  caution: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  'high-danger': 'bg-red-200 text-red-900',
};

// ── Monotony 계산 ──────────────────────────────────────────────────────
interface MonotonySeries { date: string; monotony: number | null; daily: number; }

function computeMonotony(series: TeamAcwrSeries[], window = 7): MonotonySeries[] {
  return series.map((item, i) => {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1).map(s => s.daily);
    if (slice.length < 2) return { date: item.date, monotony: null, daily: item.daily };
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    return { date: item.date, monotony: sd > 0 ? +(mean / sd).toFixed(2) : null, daily: item.daily };
  });
}

// 주별 TL Strain 집계 (마지막 6주)
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
  return [...weeks.entries()].slice(-6).map(([week, vals]) => {
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const monotony = sd > 0 ? mean / sd : 0;
    const strain = Math.round(sum * monotony);
    const d = new Date(week);
    const sun = new Date(d);
    sun.setDate(d.getDate() + 6);
    const label = `${d.getMonth() + 1}/${d.getDate()}~${sun.getMonth() + 1}/${sun.getDate()}`;
    return { week, label, strain, monotony: +monotony.toFixed(2), sum: Math.round(sum) };
  });
}

// ── ACWR 차트 ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DailyAcwrBarShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!width) return null;
  const daily = payload?.daily ?? 0;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height || 0} fill={ACWR_COLORS.daily} rx={2} ry={2} />
      {daily > 0 && <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontFamily="DM Mono" fill="#555">{Math.round(daily).toLocaleString()}</text>}
    </g>
  );
}

function AcwrComboChart({ title, data, unit }: { title: string; data: TeamAcwrSeries[]; unit?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last28 = data.slice(-28);
  const chartWidth = last28.length * 48;
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; }, [data]);

  const chartData = last28.map(d => ({
    ...d,
    acwr: d.chronic > 0 ? +((d.acute / d.chronic).toFixed(2)) : null,
  }));

  const yMax = Math.ceil(Math.max(...chartData.map(d => Math.max(d.daily, d.acute, d.chronic)), 1) * 1.35);
  const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
  const todayStr = chartData[chartData.length - 1]?.date ?? '';
  const nameMap: Record<string, string> = { daily: 'Daily', acute: 'Acute', chronic: 'Chronic', acwr: 'ACWR' };

  return (
    <div className="chart-card mb-4">
      <div className="chart-title text-center">{title}</div>
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ width: chartWidth }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 48, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 10 }} interval={0} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fontFamily: 'DM Mono' }} domain={[0, yMax]} width={50} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: ACWR_COLORS.acwr }} domain={[0, 2.6]} width={36} tickCount={6} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any, name: any) => {
                if (name === 'acwr') return [v != null ? v : '-', 'ACWR'];
                return [`${Math.round(Number(v)).toLocaleString()}${unit || ''}`, nameMap[name] ?? name];
              }} labelFormatter={(d: any) => fmt(String(d))} contentStyle={{ fontFamily: 'DM Mono', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(val) => nameMap[val] ?? val} />
              {/* 오늘 기준 수직선 */}
              <ReferenceLine yAxisId="left" x={todayStr} stroke="#374151" strokeWidth={1.5} strokeDasharray="3 3"
                label={{ value: '오늘', position: 'insideTopLeft', fontSize: 9, fill: '#374151' }} />
              {/* ACWR 임계값 수평선 — 오른쪽 Y축 기준, 라벨은 왼쪽에 */}
              <ReferenceLine yAxisId="right" y={2.0} stroke="#7f1d1d" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: '2.0', position: 'insideLeft', fontSize: 8, fill: '#7f1d1d' }} />
              <ReferenceLine yAxisId="right" y={1.5} stroke="#dc2626" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: '1.5', position: 'insideLeft', fontSize: 8, fill: '#dc2626' }} />
              <ReferenceLine yAxisId="right" y={1.3} stroke="#d97706" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: '1.3', position: 'insideLeft', fontSize: 8, fill: '#d97706' }} />
              <ReferenceLine yAxisId="right" y={0.8} stroke="#16a34a" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: '0.8', position: 'insideLeft', fontSize: 8, fill: '#16a34a' }} />
              <Area yAxisId="left" type="monotone" dataKey="chronic" name="chronic" fill={ACWR_COLORS.chronic} stroke="rgba(0,140,126,0.6)" strokeWidth={1.5} />
              <Area yAxisId="left" type="monotone" dataKey="acute" name="acute" fill={ACWR_COLORS.acute} stroke="rgba(255,99,71,0.8)" strokeWidth={1.5} />
              <Bar yAxisId="left" dataKey="daily" name="daily" fill={ACWR_COLORS.daily} barSize={16} shape={<DailyAcwrBarShape />} />
              <Line yAxisId="right" type="monotone" dataKey="acwr" name="acwr" stroke={ACWR_COLORS.acwr} strokeWidth={2}
                dot={{ r: 2, fill: ACWR_COLORS.acwr }} activeDot={{ r: 5 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Monotony 차트 (지표별 임계값 적용) ────────────────────────────────
function MonotonyChart({ title, data, metricKey }: { title: string; data: MonotonySeries[]; metricKey: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last28 = data.slice(-28);
  const chartWidth = last28.length * 48;
  const t = METRIC_THRESHOLDS[metricKey];

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; }, [data]);

  const maxVal = Math.max(...last28.map(d => d.monotony ?? 0), t.highDanger * 1.1);
  const yMax = Math.ceil(maxVal * 1.15 * 10) / 10;
  const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; };

  // 마지막 유효값의 zone
  const lastVal = [...last28].reverse().find(d => d.monotony !== null)?.monotony ?? null;
  const lastZone = getZone(lastVal, t);

  // 커스텀 dot (zone별 색상)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const val = payload?.monotony;
    if (val == null || !cx || !cy) return null;
    const zone = getZone(val, t);
    return <circle cx={cx} cy={cy} r={3.5} fill={ZONE_COLOR[zone]} stroke="#fff" strokeWidth={1} />;
  };

  // 커스텀 라벨
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomLabel = (props: any) => {
    const { x, y, value } = props;
    if (value == null) return null;
    const zone = getZone(value, t);
    return <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fontFamily="DM Mono" fill={ZONE_COLOR[zone]}>{value}</text>;
  };

  return (
    <div className="chart-card mb-4">
      <div className="flex items-center justify-center gap-2 mb-1">
        <div className="chart-title !mb-0">{title}</div>
        {lastVal !== null && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${ZONE_BADGE[lastZone]}`}>
            {lastVal} {ZONE_LABEL[lastZone]}
          </span>
        )}
      </div>
      <div className="text-center text-xs text-text-secondary mb-1" style={{ fontSize: 10 }}>
        주의 {t.caution} · 위험 {t.danger} · 고위험 {t.highDanger}
      </div>
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ width: chartWidth }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={last28} margin={{ top: 24, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 11, fontFamily: 'DM Mono' }} domain={[0, yMax]} width={40} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any) => [v != null ? v : '-', 'Monotony']} labelFormatter={(d: any) => fmt(String(d))} contentStyle={{ fontFamily: 'DM Mono', fontSize: 12 }} />
              <ReferenceLine y={t.highDanger} stroke="#7f1d1d" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: `${t.highDanger} 고위험`, position: 'insideTopRight', fontSize: 9, fill: '#7f1d1d' }} />
              <ReferenceLine y={t.danger} stroke="#dc2626" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: `${t.danger} 위험`, position: 'insideTopRight', fontSize: 9, fill: '#dc2626' }} />
              <ReferenceLine y={t.caution} stroke="#d97706" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: `${t.caution} 주의`, position: 'insideTopRight', fontSize: 9, fill: '#d97706' }} />
              <Line
                type="monotone" dataKey="monotony" stroke="#7c3aed"
                strokeWidth={2} dot={<CustomDot />} activeDot={{ r: 5 }}
                connectNulls={false} label={<CustomLabel />}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Strain 주별 바 차트 (TL 전용) ─────────────────────────────────────
function StrainBarChart({ weeklyData }: { weeklyData: ReturnType<typeof computeWeeklyStrain> }) {
  const DANGER_LINE = 6000;
  const maxStrain = Math.max(...weeklyData.map(d => d.strain), DANGER_LINE);
  const yMax = Math.ceil(maxStrain * 1.2 / 1000) * 1000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const StrainBar = (props: any) => {
    const { x, y, width, height, value, payload } = props;
    if (!width) return null;
    const isOver = payload.strain >= DANGER_LINE;
    const fill = isOver ? 'rgba(220,38,38,0.75)' : payload.strain >= DANGER_LINE * 0.85 ? 'rgba(245,158,11,0.75)' : 'rgba(124,58,237,0.65)';
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
  };

  return (
    <div className="chart-card">
      <div className="chart-title text-center mb-0.5">TL Strain — 주별 추이</div>
      <div className="text-center mb-2" style={{ fontSize: 10, color: '#6b7280' }}>Strain = 주간 합산 × Monotony · 위험 기준 6,000 AU (Alexiou &amp; Coutts, 2008)</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={weeklyData} margin={{ top: 28, right: 16, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11, fontFamily: 'DM Mono' }} domain={[0, yMax]} width={50} tickFormatter={v => v.toLocaleString()} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip formatter={(v: any) => [Number(v).toLocaleString() + ' AU', 'TL Strain']} contentStyle={{ fontFamily: 'DM Mono', fontSize: 12 }} />
          <ReferenceLine y={DANGER_LINE} stroke="#dc2626" strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: '위험 6,000', position: 'insideTopRight', fontSize: 9, fill: '#dc2626' }} />
          <Bar dataKey="strain" name="TL Strain" barSize={32} shape={<StrainBar />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Strain 현황 테이블 ─────────────────────────────────────────────────
function StrainTable({ metrics }: {
  metrics: { key: string; label: string; monotony: MonotonySeries[]; unit: string }[];
}) {
  const rows = metrics.map(({ key, label, monotony, unit }) => {
    const last7 = monotony.slice(-7);
    const weeklySum = last7.reduce((a, b) => a + b.daily, 0);
    const lastM = [...last7].reverse().find(d => d.monotony !== null)?.monotony ?? null;
    const strain = lastM !== null ? Math.round(weeklySum * lastM) : null;
    const t = METRIC_THRESHOLDS[key];
    const zone = getZone(lastM, t);
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
              <td className="py-1.5 px-2 font-mono font-bold">
                {row.strain !== null ? row.strain.toLocaleString() : '-'}
              </td>
              <td className="py-1.5 px-2">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ZONE_BADGE[row.zone]}`}>
                  {ZONE_LABEL[row.zone]}
                </span>
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

// ── Insight Box ────────────────────────────────────────────────────────
function InsightBox({ items }: { items: { label: string; val: number; zone: ZoneType; t: Thresholds }[] }) {
  const warnings = items.filter(i => i.zone === 'danger' || i.zone === 'high-danger');
  const cautions = items.filter(i => i.zone === 'caution');
  if (warnings.length === 0 && cautions.length === 0) {
    return (
      <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}>
        ✅ 모든 지표 안전 구간 — 현재 훈련 변동성이 적절하게 유지되고 있습니다.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border px-4 py-3" style={{ background: '#fefce8', borderColor: '#fcd34d', color: '#78350f' }}>
      <div className="font-bold text-sm mb-1">⚠️ 주의 필요 (오늘 기준)</div>
      <ul className="text-xs space-y-0.5" style={{ paddingLeft: 14 }}>
        {warnings.map(i => (
          <li key={i.label}>
            <strong>{i.label} Monotony {i.val}</strong> — {i.zone === 'high-danger' ? '고위험' : '위험'} 구간 (기준 {'>'}{i.zone === 'high-danger' ? i.t.highDanger : i.t.danger}). 훈련 변동성 즉시 확인 필요
          </li>
        ))}
        {cautions.map(i => (
          <li key={i.label} style={{ color: '#92400e' }}>
            {i.label} Monotony {i.val} — 주의 구간 (기준 {i.t.caution}~{i.t.danger})
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 임계값 기준표 ──────────────────────────────────────────────────────
function ThresholdTable({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const METRICS = [
    { key: 'tl', label: 'TL' }, { key: 'td', label: 'TD' }, { key: 'hsr', label: 'HSR' },
    { key: 'sprint', label: 'Sprint' }, { key: 'acd', label: 'ACD' },
  ];
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
              {METRICS.map(({ key, label }) => {
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

// ── 현황 카드 ──────────────────────────────────────────────────────────
function MonotonyStatusCards({ metrics }: {
  metrics: { label: string; metricKey: string; val: number | null }[];
}) {
  return (
    <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
      {metrics.map(({ label, metricKey, val }) => {
        const t = METRIC_THRESHOLDS[metricKey];
        const zone = getZone(val, t);
        return (
          <div key={metricKey} className="chart-card !mb-0 !p-3">
            <div className="text-text-secondary mb-1" style={{ fontSize: 10 }}>{label} Monotony</div>
            <div className="font-bold font-mono mb-1" style={{ fontSize: 22, color: ZONE_COLOR[zone] }}>
              {val ?? '-'}
            </div>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ZONE_BADGE[zone]}`}>
              {ZONE_LABEL[zone]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────
export function TeamDashboard() {
  const [data, setData] = useState<{
    tl: TeamAcwrSeries[]; td: TeamAcwrSeries[]; hsr: TeamAcwrSeries[];
    sprint: TeamAcwrSeries[]; acd: TeamAcwrSeries[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'acwr' | 'monotony'>('acwr');
  const [showThreshold, setShowThreshold] = useState(false);
  const [showAcwrThreshold, setShowAcwrThreshold] = useState(false);

  useEffect(() => {
    fetchTeamAcwrData(60).then(d => { setData(d); setLoading(false); });
  }, []);

  // Monotony 시리즈 (memoized)
  const monotonyData = useMemo(() => {
    if (!data) return null;
    return {
      tl: computeMonotony(data.tl),
      td: computeMonotony(data.td),
      hsr: computeMonotony(data.hsr),
      sprint: computeMonotony(data.sprint),
      acd: computeMonotony(data.acd),
    };
  }, [data]);

  // 최신 Monotony 값
  const latestMonotony = useMemo(() => {
    if (!monotonyData) return null;
    const last = (s: MonotonySeries[]) => [...s].reverse().find(d => d.monotony !== null)?.monotony ?? null;
    return {
      tl: last(monotonyData.tl),
      td: last(monotonyData.td),
      hsr: last(monotonyData.hsr),
      sprint: last(monotonyData.sprint),
      acd: last(monotonyData.acd),
    };
  }, [monotonyData]);

  // Insight용 아이템
  const insightItems = useMemo(() => {
    if (!latestMonotony) return [];
    return [
      { label: 'TL',     val: latestMonotony.tl!,     zone: getZone(latestMonotony.tl, METRIC_THRESHOLDS.tl),     t: METRIC_THRESHOLDS.tl },
      { label: 'TD',     val: latestMonotony.td!,     zone: getZone(latestMonotony.td, METRIC_THRESHOLDS.td),     t: METRIC_THRESHOLDS.td },
      { label: 'HSR',    val: latestMonotony.hsr!,    zone: getZone(latestMonotony.hsr, METRIC_THRESHOLDS.hsr),    t: METRIC_THRESHOLDS.hsr },
      { label: 'Sprint', val: latestMonotony.sprint!, zone: getZone(latestMonotony.sprint, METRIC_THRESHOLDS.sprint), t: METRIC_THRESHOLDS.sprint },
      { label: 'ACD',    val: latestMonotony.acd!,    zone: getZone(latestMonotony.acd, METRIC_THRESHOLDS.acd),    t: METRIC_THRESHOLDS.acd },
    ].filter(i => i.val !== null) as { label: string; val: number; zone: ZoneType; t: Thresholds }[];
  }, [latestMonotony]);

  // 최신 ACWR 값 (각 지표 마지막 acute/chronic)
  const latestAcwr = useMemo(() => {
    if (!data) return null;
    const calc = (s: TeamAcwrSeries[]) => {
      const last = [...s].reverse().find(d => d.chronic > 0);
      return last ? +((last.acute / last.chronic).toFixed(2)) : null;
    };
    return { tl: calc(data.tl), td: calc(data.td), hsr: calc(data.hsr), sprint: calc(data.sprint), acd: calc(data.acd) };
  }, [data]);

  // ACWR Insight 아이템
  const acwrInsightItems = useMemo(() => {
    if (!latestAcwr) return [];
    return [
      { label: 'TL',     val: latestAcwr.tl },
      { label: 'TD',     val: latestAcwr.td },
      { label: 'HSR',    val: latestAcwr.hsr },
      { label: 'Sprint', val: latestAcwr.sprint },
      { label: 'ACD',    val: latestAcwr.acd },
    ].filter(i => i.val !== null) as { label: string; val: number }[];
  }, [latestAcwr]);

  // Strain 데이터
  const weeklyStrain = useMemo(() => data ? computeWeeklyStrain(data.tl) : [], [data]);
  const strainMetrics = useMemo(() => {
    if (!monotonyData) return [];
    return [
      { key: 'tl', label: 'TL', monotony: monotonyData.tl, unit: ' AU' },
      { key: 'td', label: 'TD', monotony: monotonyData.td, unit: ' m' },
      { key: 'hsr', label: 'HSR', monotony: monotonyData.hsr, unit: ' m' },
      { key: 'sprint', label: 'Sprint', monotony: monotonyData.sprint, unit: ' m' },
      { key: 'acd', label: 'ACD LOAD', monotony: monotonyData.acd, unit: '' },
    ];
  }, [monotonyData]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="sec-title !mb-0">팀 대시보드</div>
        <button onClick={() => setTab('acwr')} className={`px-3 py-1.5 text-sm rounded border transition-colors ${tab === 'acwr' ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'}`}>ACWR</button>
        <button onClick={() => setTab('monotony')} className={`px-3 py-1.5 text-sm rounded border transition-colors ${tab === 'monotony' ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'}`}>MONOTONY</button>
      </div>

      {/* ── ACWR 탭 ── */}
      {tab === 'acwr' && (
        <>
          <p className="text-xs text-text-secondary mb-3">3학년 선수 팀 평균 기준 · EWMA (Acute λ=0.75, Chronic λ=0.069) · 최근 4주 · 우측 Y축 = ACWR 비율 (와인색 선)</p>

          {loading ? <div className="text-text-secondary text-center py-16">Loading...</div>
            : (data && latestAcwr) ? (
              <>
                {/* 인사이트 박스 */}
                {(() => {
                  const danger = acwrInsightItems.filter(i => getAcwrZone(i.val) === 'danger' || getAcwrZone(i.val) === 'high-danger');
                  const caution = acwrInsightItems.filter(i => getAcwrZone(i.val) === 'caution');
                  if (danger.length === 0 && caution.length === 0) return null;
                  return (
                    <div className="mb-4 rounded-lg border p-4" style={{ borderColor: danger.length > 0 ? '#fca5a5' : '#fde68a', background: danger.length > 0 ? '#fff1f2' : '#fffbeb' }}>
                      <div className="font-semibold text-sm mb-2" style={{ color: danger.length > 0 ? '#dc2626' : '#d97706' }}>
                        {danger.length > 0 ? '⚠️ 주의 필요 (오늘 기준)' : '💡 모니터링 필요 (오늘 기준)'}
                      </div>
                      <ul className="text-xs space-y-1">
                        {danger.map(i => (
                          <li key={i.label} style={{ color: '#991b1b' }}>
                            <strong>{i.label} ACWR {i.val}</strong> — {getAcwrZone(i.val) === 'high-danger' ? '고위험 구간 (기준 >2.0). 즉각 부하 조정 필요' : '위험 구간 (기준 >1.5). 부상 위험 유의하게 증가'}
                          </li>
                        ))}
                        {caution.map(i => (
                          <li key={i.label} style={{ color: '#92400e' }}>
                            {i.val < ACWR_THRESHOLDS.undertraining
                              ? `${i.label} ACWR ${i.val} — 과소훈련 구간 (기준 <0.8). 체력 저하 위험`
                              : `${i.label} ACWR ${i.val} — 주의 구간 (기준 1.3~1.5). 부하 모니터링 강화`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {/* 현황 카드 */}
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">오늘 기준 ACWR 현황</div>
                <div className="grid grid-cols-5 gap-3 mb-4">
                  {[
                    { label: 'TL',     val: latestAcwr.tl },
                    { label: 'TD',     val: latestAcwr.td },
                    { label: 'HSR',    val: latestAcwr.hsr },
                    { label: 'Sprint', val: latestAcwr.sprint },
                    { label: 'ACD',    val: latestAcwr.acd },
                  ].map(({ label, val }) => {
                    const zone = getAcwrZone(val);
                    return (
                      <div key={label} className="chart-card !p-4">
                        <div className="text-text-secondary mb-1" style={{ fontSize: 10 }}>{label} ACWR</div>
                        <div className="text-2xl font-bold mb-1" style={{ fontFamily: 'DM Mono', color: ZONE_COLOR[zone] }}>
                          {val ?? '-'}
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${ZONE_BADGE[zone]}`}>{ZONE_LABEL[zone]}</span>
                      </div>
                    );
                  })}
                </div>

                {/* 임계값 기준표 토글 */}
                <button
                  onClick={() => setShowAcwrThreshold(v => !v)}
                  className="text-xs text-text-secondary border border-surface-secondary rounded px-3 py-1 mb-4 hover:bg-surface-secondary transition-colors"
                >
                  {showAcwrThreshold ? '▲' : '▼'} EWMA ACWR 임계값 기준 보기
                </button>
                {showAcwrThreshold && (
                  <div className="chart-card mb-4 overflow-x-auto">
                    <table className="w-full text-xs" style={{ fontFamily: 'DM Mono' }}>
                      <thead>
                        <tr className="border-b border-surface-secondary">
                          <th className="py-1.5 px-3 text-left font-semibold">ACWR 범위</th>
                          <th className="py-1.5 px-3 text-left font-semibold">구간</th>
                          <th className="py-1.5 px-3 text-left font-semibold">의미</th>
                          <th className="py-1.5 px-3 text-left font-semibold">참고문헌</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ACWR_THRESHOLD_TABLE.map(row => (
                          <tr key={row.range} className="border-b border-surface-secondary last:border-0">
                            <td className="py-1.5 px-3 font-bold" style={{ color: row.color }}>{row.range}</td>
                            <td className="py-1.5 px-3 font-semibold" style={{ color: row.color }}>{row.zone}</td>
                            <td className="py-1.5 px-3 text-text-secondary">{row.basis}</td>
                            <td className="py-1.5 px-3 text-text-secondary">{row.ref}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 차트 */}
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">일별 ACWR 흐름</div>
                <div className="space-y-2">
                  <AcwrComboChart title="TL / ACWR" data={data.tl} />
                  <AcwrComboChart title="TD / ACWR" data={data.td} unit=" m" />
                  <AcwrComboChart title="HSR / ACWR" data={data.hsr} unit=" m" />
                  <AcwrComboChart title="Sprint / ACWR" data={data.sprint} unit=" m" />
                  <AcwrComboChart title="ACD LOAD / ACWR" data={data.acd} />
                </div>
              </>
            ) : <div className="text-text-secondary text-center py-16">데이터가 없습니다.</div>}
        </>
      )}

      {/* ── MONOTONY 탭 ── */}
      {tab === 'monotony' && (
        <>
          <p className="text-xs text-text-secondary mb-4">
            3학년 선수 팀 평균 기준 · 7일 롤링 윈도우 (Monotony = 평균/표준편차) · 지표별 차등 임계값 · 최근 4주
          </p>
          {loading ? <div className="text-text-secondary text-center py-16">Loading...</div>
            : (monotonyData && latestMonotony) ? (
              <>
                {/* 인사이트 박스 */}
                <InsightBox items={insightItems} />

                {/* 현황 카드 */}
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">오늘 기준 Monotony 현황</div>
                <MonotonyStatusCards metrics={[
                  { label: 'TL',     metricKey: 'tl',     val: latestMonotony.tl },
                  { label: 'TD',     metricKey: 'td',     val: latestMonotony.td },
                  { label: 'HSR',    metricKey: 'hsr',    val: latestMonotony.hsr },
                  { label: 'Sprint', metricKey: 'sprint', val: latestMonotony.sprint },
                  { label: 'ACD',    metricKey: 'acd',    val: latestMonotony.acd },
                ]} />

                {/* 임계값 기준표 (토글) */}
                <ThresholdTable show={showThreshold} onToggle={() => setShowThreshold(v => !v)} />

                {/* Monotony 차트 5개 */}
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">일별 Monotony 흐름</div>
                <MonotonyChart title="TL Monotony"        data={monotonyData.tl}     metricKey="tl" />
                <MonotonyChart title="TD Monotony"        data={monotonyData.td}     metricKey="td" />
                <MonotonyChart title="HSR Monotony"       data={monotonyData.hsr}    metricKey="hsr" />
                <MonotonyChart title="Sprint Monotony"    data={monotonyData.sprint} metricKey="sprint" />
                <MonotonyChart title="ACD LOAD Monotony"  data={monotonyData.acd}    metricKey="acd" />

                {/* Strain 섹션 */}
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 mt-2">Strain 모니터링</div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <StrainBarChart weeklyData={weeklyStrain} />
                  <StrainTable metrics={strainMetrics} />
                </div>
              </>
            ) : <div className="text-text-secondary text-center py-16">데이터가 없습니다.</div>}
        </>
      )}
    </div>
  );
}
