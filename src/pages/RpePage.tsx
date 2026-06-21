import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchRpeData } from '../lib/api';
import { chartColors, colors } from '../styles/colors';
import type { TeamDailyAggregate } from '../types';

function rpeColor(v: number): string {
  if (v <= 4) return colors.safe;
  if (v <= 6) return colors.warning;
  if (v <= 8) return colors.navy;
  return colors.danger;
}

export function RpePage() {
  const [teamTrend, setTeamTrend] = useState<TeamDailyAggregate[]>([]);
  const [playerAvgs, setPlayerAvgs] = useState<{ name: string; avg_rpe: number; sessions: number; player_id: string }[]>([]);
  const [distribution, setDistribution] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRpeData().then(d => {
      setTeamTrend(d.teamTrend);
      setPlayerAvgs(d.playerAvgs);
      setDistribution(d.distribution);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">Loading...</div>;
  }

  const trendChart = teamTrend.slice(-30).map(d => ({
    date: d.date.slice(5),
    rpe: +d.rpe_mean.toFixed(1),
  }));

  const distChart = distribution.map((count, i) => ({
    label: String(i + 1),
    count,
    color: i < 4 ? 'rgba(0, 140, 126, 0.42)' : i < 6 ? 'rgba(255, 217, 0, 0.50)' : i < 8 ? 'rgba(21, 62, 111, 0.34)' : 'rgba(164, 40, 67, 0.34)',
  }));

  const playerChart = playerAvgs.filter(p => p.avg_rpe > 0).slice(0, 25);

  return (
    <div className="p-6">
      <div className="sec-title">RPE 모니터링</div>

      <div className="grid grid-cols-2 gap-4 mb-5 chart-grid-2">
        <div className="chart-card">
          <div className="chart-title">팀 평균 RPE 추이</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Area type="monotone" dataKey="rpe" stroke={chartColors.warning} fill="rgba(255, 217, 0, 0.18)" strokeWidth={2} name="평균 RPE" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">RPE 분포 (전체 기간)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip
                formatter={(v) => [`${v}건`, 'RPE']}
                contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {distChart.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card mb-5">
        <div className="chart-title">선수별 평균 RPE</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={playerChart}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9 }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis domain={[0, 10]} tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
            <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
            <Bar dataKey="avg_rpe" radius={[3, 3, 0, 0]} name="평균 RPE">
              {playerChart.map((entry, i) => (
                <Cell key={i} fill={`${rpeColor(entry.avg_rpe)}80`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <div className="chart-title">선수별 RPE 상세</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>선수</th>
                <th className="right">평균 RPE</th>
                <th className="right">세션수</th>
              </tr>
            </thead>
            <tbody>
              {playerAvgs.filter(p => p.avg_rpe > 0).map(p => (
                <tr key={p.player_id} onClick={() => navigate(`/player/${p.player_id}`)}>
                  <td className="name">{p.name}</td>
                  <td className="num" style={{ color: rpeColor(p.avg_rpe) }}>{p.avg_rpe}</td>
                  <td className="num">{p.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
