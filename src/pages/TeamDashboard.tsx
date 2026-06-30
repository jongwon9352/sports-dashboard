import { useEffect, useState, useRef } from 'react';
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { fetchTeamAcwrData, type TeamAcwrSeries } from '../lib/api';

const COLORS = {
  daily: 'rgba(100, 149, 237, 0.6)',
  acute: 'rgba(255, 99, 71, 0.4)',
  chronic: 'rgba(0, 140, 126, 0.3)',
  acwr: '#A42843',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DailyAcwrBarShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!width) return null;
  const daily = payload?.daily ?? 0;
  const acwr = payload?.acwr ?? 0;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height || 0} fill={COLORS.daily} rx={2} ry={2} />
      {daily > 0 && (
        <text x={x + width / 2} y={y - 18} textAnchor="middle"
          fontSize={10} fontFamily="DM Mono" fill="#555">
          {Math.round(daily).toLocaleString()}
        </text>
      )}
      {acwr > 0 && (
        <text x={x + width / 2} y={y - 6} textAnchor="middle"
          fontSize={10} fontFamily="DM Mono" fontWeight="700" fill={COLORS.acwr}>
          {acwr.toFixed(2)}
        </text>
      )}
    </g>
  );
}

function AcwrComboChart({ title, data, unit }: {
  title: string;
  data: TeamAcwrSeries[];
  unit?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last28 = data.slice(-28);
  const dayWidth = 48;
  const chartWidth = last28.length * dayWidth;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [data]);

  const maxDaily = Math.max(...last28.map(d => d.daily), 1);
  const maxAcute = Math.max(...last28.map(d => Math.max(d.acute, d.chronic)), 1);
  const yMax = Math.ceil(Math.max(maxDaily, maxAcute) * 1.35);

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  return (
    <div className="chart-card mb-4">
      <div className="chart-title text-center">{title}</div>
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ width: chartWidth }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={last28} margin={{ top: 40, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 11, fontFamily: 'DM Mono' }} domain={[0, yMax]} width={50} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, name: any) => {
                  const labels: Record<string, string> = { daily: 'Daily', acute: 'Acute', chronic: 'Chronic' };
                  const label = labels[name] ?? name;
                  return [`${Math.round(Number(v)).toLocaleString()}${unit || ''}`, label];
                }}
                labelFormatter={(d: any) => formatDate(String(d))}
                contentStyle={{ fontFamily: 'DM Mono', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="chronic" name="Chronic" fill={COLORS.chronic} stroke="rgba(0,140,126,0.6)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="acute" name="Acute" fill={COLORS.acute} stroke="rgba(255,99,71,0.8)" strokeWidth={1.5} />
              <Bar dataKey="daily" name="Daily" fill={COLORS.daily} barSize={16} shape={<DailyAcwrBarShape />} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function TeamDashboard() {
  const [data, setData] = useState<{
    tl: TeamAcwrSeries[];
    td: TeamAcwrSeries[];
    hsr: TeamAcwrSeries[];
    sprint: TeamAcwrSeries[];
    acd: TeamAcwrSeries[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeamAcwrData(60).then(d => { setData(d); setLoading(false); });
  }, []);

  const [tab, setTab] = useState<'acwr' | 'monotony'>('acwr');

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="sec-title !mb-0">팀 대시보드</div>
        <button
          onClick={() => setTab('acwr')}
          className={`px-3 py-1.5 text-sm rounded border transition-colors ${
            tab === 'acwr'
              ? 'bg-purple text-white border-purple'
              : 'border-surface-secondary hover:bg-surface-secondary'
          }`}
        >
          ACWR
        </button>
        <button
          onClick={() => setTab('monotony')}
          className={`px-3 py-1.5 text-sm rounded border transition-colors ${
            tab === 'monotony'
              ? 'bg-purple text-white border-purple'
              : 'border-surface-secondary hover:bg-surface-secondary'
          }`}
        >
          MONOTONY
        </button>
      </div>

      {tab === 'acwr' && (
        <>
          <p className="text-xs text-text-secondary mb-4">3학년 선수 팀 평균 기준 · EWMA (Acute λ=0.75, Chronic λ=0.069) · 최근 4주</p>
          {loading ? (
            <div className="text-text-secondary text-center py-16">Loading...</div>
          ) : data ? (
            <div className="space-y-2">
              <AcwrComboChart title="TL / ACWR" data={data.tl} />
              <AcwrComboChart title="TD / ACWR" data={data.td} unit=" m" />
              <AcwrComboChart title="HSR / ACWR" data={data.hsr} unit=" m" />
              <AcwrComboChart title="Sprint / ACWR" data={data.sprint} unit=" m" />
              <AcwrComboChart title="ACD LOAD / ACWR" data={data.acd} />
            </div>
          ) : (
            <div className="text-text-secondary text-center py-16">데이터가 없습니다.</div>
          )}
        </>
      )}

      {tab === 'monotony' && (
        <div className="text-text-secondary text-center py-16">준비 중입니다.</div>
      )}
    </div>
  );
}
