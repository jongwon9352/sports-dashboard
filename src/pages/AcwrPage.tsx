import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';
import { fetchPlayersWithAcwr } from '../lib/api';
import { getZoneColor, getZoneLabel } from '../utils/calculations';
import type { PlayerWithAcwr } from '../types';

export function AcwrPage() {
  const [players, setPlayers] = useState<PlayerWithAcwr[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlayersWithAcwr().then(p => {
      setPlayers(p);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">Loading...</div>;
  }

  const withAcwr = players.filter(p => p.acwr_data?.acwr != null);
  const chartData = withAcwr
    .sort((a, b) => Number(b.acwr_data!.acwr) - Number(a.acwr_data!.acwr))
    .map(p => ({
      name: p.name,
      acwr: +Number(p.acwr_data!.acwr).toFixed(3),
      zone: p.acwr_zone,
    }));

  const zones = [
    { label: '과소훈련', range: '< 0.8', color: '#6B3FA0', desc: '체력 유지 부족' },
    { label: '안전구간', range: '0.8–1.3', color: '#43A047', desc: '최적 훈련 범위' },
    { label: '주의', range: '1.3–1.5', color: '#FB8C00', desc: '부하 모니터링 필요' },
    { label: '위험', range: '> 1.5', color: '#E53935', desc: '부상 위험 높음' },
  ];

  return (
    <div className="p-6">
      <div className="sec-title">ACWR 현황</div>

      <div className="chart-card mb-4">
        <div className="chart-title">ACWR 안전 구간 기준</div>
        <div className="acwr-zone-bar">
          <div style={{ flex: '0 0 26%', background: 'rgba(107, 63, 160, 0.25)' }} />
          <div style={{ flex: '0 0 20%', background: 'rgba(67, 160, 71, 0.25)' }} />
          <div style={{ flex: '0 0 8%', background: 'rgba(251, 140, 0, 0.25)' }} />
          <div style={{ flex: 1, background: 'rgba(229, 57, 53, 0.25)' }} />
        </div>
        <div className="flex text-[9px] mb-4" style={{ fontFamily: 'var(--font-data)' }}>
          <span style={{ width: '26%', color: '#6B3FA0' }}>과소훈련 {'<'}0.8</span>
          <span style={{ width: '20%', color: '#43A047' }}>안전 0.8–1.3</span>
          <span style={{ width: '8%', color: '#FB8C00' }}>주의</span>
          <span style={{ flex: 1, color: '#E53935' }}>위험 {'>'}1.5</span>
        </div>
        <div className="grid grid-cols-4 gap-3 stat-grid-4">
          {zones.map(z => (
            <div key={z.label} className="bg-surface-secondary rounded-lg p-3 border border-surface-secondary">
              <div
                className="text-[10px] tracking-[1px] uppercase"
                style={{ fontFamily: 'var(--font-data)', color: z.color }}
              >
                {z.label}
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: z.color }}>{z.range}</div>
              <div className="text-[11px] text-text-disabled mt-1">{z.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card mb-4">
        <div className="chart-title">전체 선수 ACWR</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9 }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={70}
            />
            <YAxis domain={[0, 2.5]} tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
            <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
            <ReferenceLine y={0.8} stroke="#6B3FA0" strokeDasharray="4 4" strokeWidth={1} label={{ value: '0.8', position: 'right', fontSize: 9 }} />
            <ReferenceLine y={1.3} stroke="#43A047" strokeDasharray="4 4" strokeWidth={1} label={{ value: '1.3', position: 'right', fontSize: 9 }} />
            <ReferenceLine y={1.5} stroke="#E53935" strokeDasharray="4 4" strokeWidth={1} label={{ value: '1.5', position: 'right', fontSize: 9 }} />
            <Bar dataKey="acwr" radius={[3, 3, 0, 0]} name="ACWR">
              {chartData.map((entry, i) => (
                <Cell key={i} fill={`${getZoneColor(entry.zone)}60`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <div className="chart-title">ACWR × Monotony 현황</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>선수</th>
                <th>포지션</th>
                <th className="right">ACWR</th>
                <th>상태</th>
                <th className="right">Monotony</th>
                <th className="right">Acute</th>
                <th className="right">Chronic</th>
              </tr>
            </thead>
            <tbody>
              {players
                .filter(p => p.acwr_data)
                .sort((a, b) => Number(b.acwr_data!.acwr) - Number(a.acwr_data!.acwr))
                .map(p => (
                  <tr key={p.id} onClick={() => navigate(`/player/${p.id}`)}>
                    <td className="name">{p.name}</td>
                    <td>{p.position ?? '-'}</td>
                    <td className="num" style={{ color: getZoneColor(p.acwr_zone) }}>
                      {Number(p.acwr_data!.acwr).toFixed(3)}
                    </td>
                    <td>
                      <span className="zone-badge" style={{
                        color: getZoneColor(p.acwr_zone),
                        background: `${getZoneColor(p.acwr_zone)}15`,
                      }}>
                        {getZoneLabel(p.acwr_zone)}
                      </span>
                    </td>
                    <td className="num" style={{ color: p.monotony && p.monotony > 2 ? '#E53935' : undefined }}>
                      {p.monotony ? p.monotony.toFixed(2) : '—'}
                    </td>
                    <td className="num">{Number(p.acwr_data!.acute_ewma).toFixed(0)}</td>
                    <td className="num">{Number(p.acwr_data!.chronic_ewma).toFixed(0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
