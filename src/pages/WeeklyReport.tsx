import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchTeamDailyAggregates } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { chartColors, colors } from '../styles/colors';
import type { TeamDailyAggregate } from '../types';

function getWeekStart(dateStr: string): string {
  const dt = new Date(dateStr);
  const day = dt.getDay();
  const diff = day === 0 ? 6 : day - 1;
  dt.setDate(dt.getDate() - diff);
  return dt.toISOString().split('T')[0];
}

export function WeeklyReport() {
  const [dailyData, setDailyData] = useState<TeamDailyAggregate[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeamDailyAggregates(120).then(data => {
      setDailyData(data);
      const weekSet = new Set<string>();
      data.forEach(d => weekSet.add(getWeekStart(d.date)));
      const sortedWeeks = [...weekSet].sort().reverse();
      setWeeks(sortedWeeks);
      if (sortedWeeks.length > 0) setSelectedWeek(sortedWeeks[0]);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">Loading...</div>;
  }

  const weekDays = dailyData
    .filter(d => getWeekStart(d.date) === selectedWeek)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalTd = weekDays.reduce((s, d) => s + d.td_mean, 0);
  const totalHsr = weekDays.reduce((s, d) => s + d.hsr_mean, 0);
  const rpes = weekDays.filter(d => d.rpe_mean > 0);
  const avgRpe = rpes.length > 0 ? rpes.reduce((s, d) => s + d.rpe_mean, 0) / rpes.length : 0;

  const chartData = weekDays.map(d => ({
    date: d.date.slice(5),
    td: Math.round(d.td_mean),
    hsr: Math.round(d.hsr_mean),
    sprint: Math.round(d.sprint_mean),
    rpe: +d.rpe_mean.toFixed(1),
    players: d.player_count,
  }));

  return (
    <div className="p-6">
      <div className="sec-title">주별 리포트</div>

      <div className="flex items-center gap-3 mb-5">
        <label
          className="text-[10px] tracking-[1px] uppercase text-text-disabled"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          주차 선택
        </label>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          className="px-3 py-1.5 border border-surface-secondary rounded-[var(--radius-sm)] text-sm bg-white outline-none focus:border-purple"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          {weeks.map(w => <option key={w} value={w}>{w} 주</option>)}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5 stat-grid-4">
        <StatCard label="훈련일수" value={weekDays.length} sub="일" accent={colors.navy} />
        <StatCard label="총 평균 TD" value={Math.round(totalTd).toLocaleString()} sub="m (합계)" accent={colors.green} />
        <StatCard label="총 평균 HSR" value={Math.round(totalHsr).toLocaleString()} sub="m (합계)" accent={colors.wine} />
        <StatCard label="주간 평균 RPE" value={avgRpe ? avgRpe.toFixed(1) : '—'} sub="/ 10" accent={colors.warning} />
      </div>

      <div className="chart-card mb-4">
        <div className="chart-title">요일별 평균 TD / HSR</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
            <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
            <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
            <Bar dataKey="td" fill="rgba(21, 62, 111, 0.26)" radius={[3, 3, 0, 0]} name="평균 TD(m)" />
            <Bar dataKey="hsr" fill="rgba(0, 140, 126, 0.30)" radius={[3, 3, 0, 0]} name="평균 HSR(m)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4 chart-grid-2">
        <div className="chart-card">
          <div className="chart-title">요일별 참여 선수 / RPE</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Bar dataKey="players" fill="rgba(21, 62, 111, 0.20)" radius={[3, 3, 0, 0]} name="참여 선수" />
              <Bar dataKey="rpe" fill="rgba(255, 217, 0, 0.45)" radius={[3, 3, 0, 0]} name="평균 RPE" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">요일별 Sprint 추이</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Bar dataKey="sprint" fill="rgba(164, 40, 67, 0.28)" radius={[3, 3, 0, 0]} name="Sprint(m)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
