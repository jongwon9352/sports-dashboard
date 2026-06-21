import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchPlayersWithAcwr, fetchTeamDailyAggregates } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { getZoneColor, getZoneLabel } from '../utils/calculations';
import { chartColors, colors } from '../styles/colors';
import type { PlayerWithAcwr, TeamDailyAggregate } from '../types';

const ZONE_PRIORITY = { danger: 0, caution: 1, insufficient: 2, safe: 3 } as const;

export function Dashboard() {
  const [players, setPlayers] = useState<PlayerWithAcwr[]>([]);
  const [teamDaily, setTeamDaily] = useState<TeamDailyAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      fetchPlayersWithAcwr(),
      fetchTeamDailyAggregates(60),
    ]).then(([p, td]) => {
      setPlayers(p);
      setTeamDaily(td);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  const sorted = [...players].sort(
    (a, b) => ZONE_PRIORITY[a.acwr_zone] - ZONE_PRIORITY[b.acwr_zone],
  );
  const dangerCount = players.filter(p => p.acwr_zone === 'danger').length;
  const cautionCount = players.filter(p => p.acwr_zone === 'caution').length;
  const safeCount = players.filter(p => p.acwr_zone === 'safe').length;

  const chartDaily = teamDaily.slice(-28).map(d => ({
    date: d.date.slice(5),
    td: Math.round(d.td_mean),
    rpe: +d.rpe_mean.toFixed(1),
    hsr: Math.round(d.hsr_mean),
    sprint: Math.round(d.sprint_mean),
  }));

  return (
    <div className="p-6">
      <div className="sec-title">팀 대시보드</div>

      <div className="grid grid-cols-4 gap-3 mb-5 stat-grid-4">
        <StatCard label="총 선수" value={players.length} sub="등록 선수" accent={colors.navy} />
        <StatCard label="안전 구간" value={safeCount} sub="ACWR 0.8–1.3" accent={colors.safe} valueColor={colors.safe} />
        <StatCard label="주의" value={cautionCount} sub="ACWR 주의 범위" accent={colors.warning} valueColor={colors.warning} />
        <StatCard label="위험" value={dangerCount} sub="ACWR > 상한" accent={colors.danger} valueColor={colors.danger} />
      </div>

      <div className="chart-card mb-4">
        <div className="chart-title">팀 일별 평균 TD (Total Distance)</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartDaily}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
            <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
            <Tooltip
              formatter={(v) => [`${Number(v).toLocaleString()} m`, '평균 TD']}
              contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }}
            />
            <Bar dataKey="td" fill="rgba(21, 62, 111, 0.26)" radius={[3, 3, 0, 0]} stroke={chartColors.primary} strokeWidth={1} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5 chart-grid-2">
        <div className="chart-card">
          <div className="chart-title">평균 RPE 추이</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Area type="monotone" dataKey="rpe" stroke={chartColors.warning} fill="rgba(255, 217, 0, 0.18)" strokeWidth={2} name="평균 RPE" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">HSR / Sprint 추이</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Line type="monotone" dataKey="hsr" stroke={chartColors.secondary} strokeWidth={2} dot={false} name="HSR(m)" />
              <Line type="monotone" dataKey="sprint" stroke={chartColors.tertiary} strokeWidth={2} dot={false} name="Sprint(m)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-title">선수별 ACWR 현황</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>선수</th>
                <th>포지션</th>
                <th>성숙도</th>
                <th className="right">ACWR</th>
                <th>상태</th>
                <th className="right">Monotony</th>
                <th className="right">Acute</th>
                <th className="right">Chronic</th>
                <th className="right">Daily Load</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(player => (
                <tr key={player.id} onClick={() => navigate(`/player/${player.id}`)}>
                  <td className="name">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: getZoneColor(player.acwr_zone) }}
                      >
                        {player.jersey_number ?? '–'}
                      </div>
                      {player.name}
                    </div>
                  </td>
                  <td>{player.position ?? '-'}</td>
                  <td><MaturityPill status={player.maturity_status ?? 'Mid'} /></td>
                  <td className="num" style={{ color: getZoneColor(player.acwr_zone) }}>
                    {player.acwr_data?.acwr != null ? Number(player.acwr_data.acwr).toFixed(2) : '—'}
                  </td>
                  <td>
                    <span
                      className="zone-badge"
                      style={{
                        color: getZoneColor(player.acwr_zone),
                        background: `${getZoneColor(player.acwr_zone)}15`,
                      }}
                    >
                      {getZoneLabel(player.acwr_zone)}
                    </span>
                  </td>
                  <td className="num" style={{ color: player.monotony && player.monotony > 2 ? colors.danger : undefined }}>
                    {player.monotony ? player.monotony.toFixed(2) : '—'}
                  </td>
                  <td className="num">
                    {player.acwr_data?.acute_ewma ? Number(player.acwr_data.acute_ewma).toFixed(0) : '—'}
                  </td>
                  <td className="num">
                    {player.acwr_data?.chronic_ewma ? Number(player.acwr_data.chronic_ewma).toFixed(0) : '—'}
                  </td>
                  <td className="num">
                    {player.acwr_data?.daily_load ? Number(player.acwr_data.daily_load).toFixed(0) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MaturityPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; text: string }> = {
    Pre: { label: 'Pre', bg: '#E8EEF5', text: colors.navy },
    Mid: { label: 'Mid', bg: '#FFF6CC', text: '#8A6B00' },
    Post: { label: 'Post', bg: '#E0F3F0', text: '#006D62' },
  };
  const c = cfg[status] ?? cfg.Mid;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}
