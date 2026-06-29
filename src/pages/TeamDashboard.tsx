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
  const yMax = Math.ceil(Math.max(maxDaily, maxAcute) * 1.2);

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
            <ComposedChart data={last28} margin={{ top: 25, right: 20, bottom: 20, left: 10 }}>
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
              <Bar dataKey="daily" name="Daily" fill={COLORS.daily} barSize={16} />
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

  return (
    <div className="p-6">
      <div className="sec-title">팀 대시보드</div>
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
    </div>
  );
}
