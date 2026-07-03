import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchAllPlayers, fetchPhysicalTestRecords, fetchMaturityRecords, type PhysicalTestRow, type MaturityRow } from '../lib/api';
import type { Player } from '../types';
import { colors } from '../styles/colors';

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

function axisLabel(v: number, range: number): string {
  const decimals = range < 3 ? 2 : range < 30 ? 1 : 0;
  return v.toFixed(decimals);
}

function TrendChart({ points, color, unit }: { points: { date: string; value: number }[]; color: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 100;
  const h = 100;
  const padX = 6;
  const padY = 14;
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xAt = (i: number) => padX + (i / (points.length - 1 || 1)) * (w - padX * 2);
  const yAt = (v: number) => h - padY - ((v - min) / range) * (h - padY * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const gridVals = range === 0 ? [min] : [max, (min + max) / 2, min];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex' }}>
        <div style={{ position: 'relative', width: 28, flexShrink: 0 }}>
          {gridVals.map((gv, i) => (
            <span
              key={i}
              style={{ position: 'absolute', top: `${yAt(gv)}%`, right: 4, transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)' }}
            >
              {axisLabel(gv, range)}
            </span>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, height: 90 }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            {gridVals.map((gv, i) => (
              <line key={i} x1={padX} x2={w - padX} y1={yAt(gv)} y2={yAt(gv)} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2" />
            ))}
            <path d={path} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={xAt(i)}
                cy={yAt(p.value)}
                r={hover === i ? 3 : 2}
                fill="var(--surface-2)"
                stroke={color}
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </svg>
          {hover != null && (
            <div
              style={{
                position: 'absolute',
                left: `${xAt(hover)}%`,
                top: `${yAt(points[hover].value)}%`,
                transform: 'translate(-50%, -130%)',
                background: 'var(--surface-2)',
                border: '0.5px solid var(--border-strong)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 12,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <span style={{ fontWeight: 500 }}>{points[hover].value.toFixed(2)} {unit}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{points[hover].date}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-text-disabled mt-1" style={{ paddingLeft: 28 }}>
        {points.map(p => (
          <span key={p.date}>{p.date}</span>
        ))}
      </div>
    </div>
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
      <TrendChart points={points} color={color} unit={metric.unit} />
    </div>
  );
}

const STAGE_COLOR: Record<string, string> = {
  '성장 급증기 전': colors.navy,
  '성장 급증기': colors.green,
  '성장 급증기 후': colors.wine,
};

function MaturityCharts({ rows }: { rows: MaturityRow[] }) {
  const data = useMemo(() => {
    return rows
      .filter(r => r.predicted_adult_height_cm != null && r.mirwald_aphv_age != null && r.pah_percent != null)
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [rows]);

  if (data.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-16">신체 성숙도 계산에 필요한 데이터(신장/앉은키/부모 신장 등)가 입력된 선수가 없습니다.</p>;
  }

  const chartHeight = Math.max(280, data.length * 26);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
          선수별 현재 키 · 최대 성장 키 예측(Khamis-Roche)
        </p>
        <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={colors.grid} horizontal={false} />
              <XAxis type="number" unit="cm" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="player_name" width={70} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `${v} cm`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="baseline_height_cm" name="현재 키" fill={colors.muted} radius={[0, 3, 3, 0]} />
              <Bar dataKey="predicted_adult_height_cm" name="예측 최대 키" fill={colors.navy} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
          선수별 PHV(성장 급증 정점) 예측 나이
        </p>
        <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={colors.grid} horizontal={false} />
              <XAxis type="number" unit="세" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="player_name" width={70} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, _n, p) => [`${v}세`, p?.payload?.maturity_stage]} />
              <Bar dataKey="mirwald_aphv_age" name="APHV(세)" radius={[0, 3, 3, 0]}>
                {data.map(r => (
                  <Cell key={r.player_id} fill={STAGE_COLOR[r.maturity_stage ?? ''] ?? colors.muted} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-[11px] text-text-secondary">
            {Object.entries(STAGE_COLOR).map(([stage, color]) => (
              <span key={stage} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                {stage}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
          선수별 최대 성장 키 예측 도달률(%PAH)
        </p>
        <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={colors.grid} horizontal={false} />
              <XAxis type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="player_name" width={70} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `${v}%`} />
              <Bar dataKey="pah_percent" name="도달률" fill={colors.green} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
  const [maturityRows, setMaturityRows] = useState<MaturityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAllPlayers(), fetchPhysicalTestRecords(), fetchMaturityRecords()]).then(([p, records, maturity]) => {
      setPlayers(p);
      if (p.length > 0) setSelectedId(p[0].id);
      setAllRecords(records);
      setMaturityRows(maturity);
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

      {tab === 'vald' ? (
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
      ) : tab === 'maturity' ? (
        loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : (
          <MaturityCharts rows={maturityRows} />
        )
      ) : (
        <p className="text-sm text-text-secondary text-center py-16">준비 중입니다.</p>
      )}
    </div>
  );
}
