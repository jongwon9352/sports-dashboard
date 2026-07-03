import { useEffect, useMemo, useState } from 'react';
import { fetchAllPlayers, fetchPhysicalTestRecords, type PhysicalTestRow } from '../lib/api';
import type { Player } from '../types';

interface MetricDef {
  label: string;
  unit: string;
  invert?: boolean; // true면 값이 낮을수록 좋은 지표
  getValue: (r: PhysicalTestRow) => number | null;
}

function avg(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

const SECTIONS: { title: string; metrics: MetricDef[] }[] = [
  {
    title: 'Strength',
    metrics: [
      { label: '햄스트링 근력 Hamstring Ecc', unit: 'N', getValue: r => avg(r.nordic_curl_left, r.nordic_curl_right) },
      { label: '햄스트링 등척 Hamstring ISO', unit: 'N', getValue: r => avg(r.ham_iso_left, r.ham_iso_right) },
      { label: '고관절 내전근 Hip Adduction', unit: 'N', getValue: r => avg(r.hip_ad_left, r.hip_ad_right) },
      { label: '고관절 외전근 Hip Abduction', unit: 'N', getValue: r => avg(r.hip_ab_left, r.hip_ab_right) },
    ],
  },
  {
    title: 'Agility',
    metrics: [
      { label: '방향전환 COD', unit: 'sec', invert: true, getValue: r => r.cod_run },
      { label: '드리블 COD with ball', unit: 'sec', invert: true, getValue: r => r.cod_ball },
    ],
  },
  {
    title: 'Speed and acceleration',
    metrics: [
      { label: '5m 스프린트', unit: 'sec', invert: true, getValue: r => r.sprint_5m_time },
      { label: '10m 스프린트', unit: 'sec', invert: true, getValue: r => r.sprint_10m_time },
      { label: '30m 스프린트', unit: 'sec', invert: true, getValue: r => r.sprint_30m_time },
    ],
  },
  {
    title: 'Power',
    metrics: [
      { label: '반동점프 CMJ', unit: 'cm', getValue: r => r.cmj_height },
      { label: '스쿼트 점프 Squat jump', unit: 'cm', getValue: r => r.squat_jump_height },
    ],
  },
];

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 140;
  const h = 40;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => ({
    x: pad + (i / (values.length - 1 || 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      ))}
    </svg>
  );
}

function MetricCard({ metric, rows }: { metric: MetricDef; rows: PhysicalTestRow[] }) {
  const points = rows
    .map(r => ({ date: `${r.test_round}차`, value: metric.getValue(r) }))
    .filter((p): p is { date: string; value: number } => p.value != null);

  if (points.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
        <p className="text-[12px] text-text-secondary mb-1.5">{metric.label}</p>
        <p className="text-sm text-text-disabled">데이터 없음</p>
      </div>
    );
  }

  const latest = points[points.length - 1].value;
  const color = metric.invert ? '#E24B4A' : '#378ADD';

  return (
    <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
      <p className="text-[12px] text-text-secondary mb-1.5">{metric.label}</p>
      <p className="text-xl font-medium mb-2">
        {latest.toFixed(2)} <span className="text-xs font-normal text-text-disabled">{metric.unit}</span>
      </p>
      <Sparkline values={points.map(p => p.value)} color={color} />
      <div className="flex justify-between text-[11px] text-text-disabled mt-0.5">
        {points.map(p => (
          <span key={p.date}>{p.date}</span>
        ))}
      </div>
    </div>
  );
}

type Tab = 'vald' | 'body' | 'speed' | 'maturity';

export function PhysicalOverviewPage() {
  const [tab, setTab] = useState<Tab>('vald');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [allRecords, setAllRecords] = useState<PhysicalTestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAllPlayers(), fetchPhysicalTestRecords()]).then(([p, records]) => {
      setPlayers(p);
      if (p.length > 0) setSelectedId(p[0].id);
      setAllRecords(records);
      setLoading(false);
    });
  }, []);

  const rows = useMemo(() => {
    return allRecords
      .filter(r => r.player_id === selectedId && r.test_round)
      .sort((a, b) => a.test_date.localeCompare(b.test_date));
  }, [allRecords, selectedId]);

  const player = players.find(p => p.id === selectedId) ?? null;

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 text-sm rounded border transition-colors ${
        tab === id ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6">
      <div className="sec-title">피지컬</div>

      <div className="flex gap-2 mb-4">
        {tabBtn('vald', 'VALD')}
        {tabBtn('body', 'Body composition')}
        {tabBtn('speed', 'Speed custom')}
        {tabBtn('maturity', '신체 성숙도')}
      </div>

      {tab !== 'vald' ? (
        <p className="text-sm text-text-secondary text-center py-16">준비 중입니다.</p>
      ) : (
        <>
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

          {loading ? (
            <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-16">{player?.name ?? '선수'}의 VALD 측정 기록이 없습니다.</p>
          ) : (
            SECTIONS.map(section => (
              <div key={section.title} className="mb-5">
                <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
                  {section.title}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {section.metrics.map(metric => (
                    <MetricCard key={metric.label} metric={metric} rows={rows} />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
