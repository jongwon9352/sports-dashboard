import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { fetchPlayersWithAcwr, fetchPlayerAcwrMultiMetric, type TeamAcwrSeries } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { colors } from '../styles/colors';
import type { PlayerWithAcwr } from '../types';

// ── 5개 항목 (팀 대시보드와 동일) ─────────────────────────────────────────
const METRIC_KEYS = [
  { key: 'tl',     label: 'TL',     unit: ' AU' },
  { key: 'td',     label: 'TD',     unit: ' m'  },
  { key: 'hsr',    label: 'HSR',    unit: ' m'  },
  { key: 'sprint', label: 'Sprint', unit: ' m'  },
  { key: 'acd',    label: 'ACD',    unit: ''    },
] as const;
type MetricKey = typeof METRIC_KEYS[number]['key'];

const METRIC_THRESHOLDS: Record<MetricKey, { caution: number; danger: number }> = {
  tl:     { caution: 1.0, danger: 1.5 },
  td:     { caution: 1.3, danger: 1.8 },
  hsr:    { caution: 0.8, danger: 1.2 },
  sprint: { caution: 0.8, danger: 1.2 },
  acd:    { caution: 1.0, danger: 1.5 },
};

function acwrZoneColor(val: number | null, key: MetricKey): string {
  if (val === null) return colors.muted;
  const t = METRIC_THRESHOLDS[key];
  if (val >= t.danger) return colors.danger;
  if (val >= t.caution) return colors.warning;
  if (val < 0.8) return colors.warning;
  return colors.safe;
}

interface MonotonyPoint { date: string; monotony: number | null }

function computeMonotony(series: TeamAcwrSeries[], window = 7): MonotonyPoint[] {
  return series.map((item, i) => {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1).map(s => s.daily);
    if (slice.length < 2) return { date: item.date, monotony: null };
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    return { date: item.date, monotony: sd > 0 ? +(mean / sd).toFixed(2) : null };
  });
}

function monotonyColor(val: number | null): string {
  if (val === null) return colors.muted;
  return val > 2 ? colors.danger : colors.safe;
}

type MetricData = Record<MetricKey, TeamAcwrSeries[]>;

export function PersonalDashboard() {
  const [players, setPlayers] = useState<PlayerWithAcwr[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [data, setData] = useState<MetricData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<MetricKey>('tl');

  useEffect(() => {
    fetchPlayersWithAcwr().then(p => {
      setPlayers(p);
      if (p.length > 0) setSelectedId(p[0].id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setData(null);
    fetchPlayerAcwrMultiMetric(selectedId, 90).then(d => setData(d as MetricData));
  }, [selectedId]);

  const player = players.find(p => p.id === selectedId) ?? null;

  const acwrLatest = useMemo(() => {
    if (!data) return {} as Record<MetricKey, number | null>;
    const calc = (s: TeamAcwrSeries[]) => {
      const last = [...s].reverse().find(d => d.chronic > 0);
      return last ? +((last.acute / last.chronic).toFixed(2)) : null;
    };
    return Object.fromEntries(METRIC_KEYS.map(({ key }) => [key, calc(data[key])])) as Record<MetricKey, number | null>;
  }, [data]);

  const monotonySeries = useMemo(() => {
    if (!data) return null;
    return Object.fromEntries(METRIC_KEYS.map(({ key }) => [key, computeMonotony(data[key])])) as Record<MetricKey, MonotonyPoint[]>;
  }, [data]);

  const monotonyLatest = useMemo(() => {
    if (!monotonySeries) return {} as Record<MetricKey, number | null>;
    return Object.fromEntries(
      METRIC_KEYS.map(({ key }) => [key, [...monotonySeries[key]].reverse().find(d => d.monotony !== null)?.monotony ?? null])
    ) as Record<MetricKey, number | null>;
  }, [monotonySeries]);

  const acwrChartData = useMemo(() => {
    if (!data) return [];
    return data[chartMetric].slice(-30).map(d => ({
      date: d.date.slice(5),
      acwr: +d.acwr.toFixed(2),
    }));
  }, [data, chartMetric]);

  const monotonyChartData = useMemo(() => {
    if (!monotonySeries) return [];
    return monotonySeries[chartMetric].slice(-30).map(d => ({
      date: d.date.slice(5),
      monotony: d.monotony,
    }));
  }, [monotonySeries, chartMetric]);

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">Loading...</div>;
  }

  const thresholds = METRIC_THRESHOLDS[chartMetric];
  const metricLabel = METRIC_KEYS.find(m => m.key === chartMetric)!.label;

  return (
    <div className="p-6">
      <div className="sec-title">운동부하</div>

      {/* 탭 (단일 · 향후 확장용) */}
      <div className="flex gap-2 mb-4">
        <button className="px-3 py-1.5 text-sm rounded border transition-colors bg-purple text-white border-purple">
          운동부하
        </button>
      </div>

      {/* 선수 선택 */}
      <div className="chart-card mb-4">
        <div className="flex items-center gap-4">
          <label className="text-xs text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>
            선수 선택
          </label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 max-w-xs border border-surface-secondary rounded px-3 py-1.5 text-sm"
          >
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.name} · {p.position} · {p.grade}</option>
            ))}
          </select>
        </div>
      </div>

      {player && (
        <div className="chart-card flex items-center gap-5 mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${acwrZoneColor(acwrLatest.tl, 'tl')}, ${colors.navy})` }}
          >
            {player.jersey_number ?? '–'}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{player.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-text-secondary text-sm">{player.position} · {player.grade}</span>
              <MaturityPill status={player.maturity_status ?? 'Mid'} />
            </div>
          </div>
        </div>
      )}

      {/* ACWR 요약 5개 항목 */}
      <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>ACWR</p>
      <div className="grid grid-cols-5 gap-3 mb-5 stat-grid-4">
        {METRIC_KEYS.map(({ key, label }) => (
          <StatCard
            key={key}
            label={`${label} ACWR`}
            value={acwrLatest[key] != null ? acwrLatest[key]!.toFixed(2) : '—'}
            accent={acwrZoneColor(acwrLatest[key] ?? null, key)}
            valueColor={acwrZoneColor(acwrLatest[key] ?? null, key)}
          />
        ))}
      </div>

      {/* MONOTONY 요약 5개 항목 */}
      <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>MONOTONY</p>
      <div className="grid grid-cols-5 gap-3 mb-5 stat-grid-4">
        {METRIC_KEYS.map(({ key, label }) => (
          <StatCard
            key={key}
            label={`${label} Monotony`}
            value={monotonyLatest[key] != null ? monotonyLatest[key]!.toFixed(2) : '—'}
            accent={monotonyColor(monotonyLatest[key] ?? null)}
            valueColor={monotonyColor(monotonyLatest[key] ?? null)}
          />
        ))}
      </div>

      {/* 항목 선택 */}
      <div className="flex gap-2 mb-4">
        {METRIC_KEYS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setChartMetric(key)}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              chartMetric === key ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {acwrChartData.length > 0 && (
        <div className="chart-card mb-4">
          <div className="chart-title">{metricLabel} ACWR 추이 (최근 30일)</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={acwrChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis domain={[0, 2.5]} tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <ReferenceLine y={0.8} stroke={colors.warning} strokeDasharray="4 4" label={{ value: '하한', fontSize: 9 }} />
              <ReferenceLine y={thresholds.caution} stroke={colors.safe} strokeDasharray="4 4" label={{ value: '안전상한', fontSize: 9 }} />
              <ReferenceLine y={thresholds.danger} stroke={colors.danger} strokeDasharray="4 4" label={{ value: '위험', fontSize: 9 }} />
              <Line type="monotone" dataKey="acwr" stroke={colors.navy} strokeWidth={2.5} dot={false} name={`${metricLabel} ACWR`} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {monotonyChartData.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">{metricLabel} Monotony 추이 (최근 30일)</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monotonyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <ReferenceLine y={2} stroke={colors.danger} strokeDasharray="4 4" label={{ value: '위험 (>2)', fontSize: 9 }} />
              <Line type="monotone" dataKey="monotony" stroke={colors.wine} strokeWidth={2} dot={false} name={`${metricLabel} Monotony`} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MaturityPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; text: string }> = {
    Pre: { label: 'Pre-PHV', bg: '#E8EEF5', text: colors.navy },
    Mid: { label: 'Mid-PHV', bg: '#FFF6CC', text: '#8A6B00' },
    Post: { label: 'Post-PHV', bg: '#E0F3F0', text: '#006D62' },
  };
  const c = cfg[status] ?? cfg.Mid;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}
