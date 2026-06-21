import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchAvailableDates, fetchDailyReportData } from '../lib/api';
import { StatCard } from '../components/StatCard';
import type { DailyReportRow } from '../types';

export function DailyReport() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [data, setData] = useState<DailyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAvailableDates().then(d => {
      setDates(d);
      if (d.length > 0) {
        setSelectedDate(d[0]);
        fetchDailyReportData(d[0]).then(rows => {
          setData(rows);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setLoading(true);
    fetchDailyReportData(date).then(rows => {
      setData(rows);
      setLoading(false);
    });
  };

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgTd = avg(data.map(d => d.total_distance));
  const avgHsr = avg(data.map(d => d.hsr_distance));
  const rpes = data.filter(d => d.rpe != null).map(d => d.rpe!);
  const avgRpe = avg(rpes);

  const chartData = data.slice(0, 20).map(d => ({
    name: d.player_name,
    td: Math.round(d.total_distance),
    hsr: Math.round(d.hsr_distance),
    sprint: Math.round(d.sprint_distance),
  }));

  return (
    <div className="p-6">
      <div className="sec-title">일별 리포트</div>

      <div className="flex items-center gap-3 mb-5">
        <label
          className="text-[10px] tracking-[1px] uppercase text-text-disabled"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          날짜 선택
        </label>
        <select
          value={selectedDate}
          onChange={e => handleDateChange(e.target.value)}
          className="px-3 py-1.5 border border-surface-secondary rounded-[var(--radius-sm)] text-sm bg-white outline-none focus:border-purple"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          {dates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-text-secondary text-center py-16">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-5 stat-grid-4">
            <StatCard label="참여 선수" value={data.length} sub="명" accent="#6B3FA0" />
            <StatCard label="팀 평균 TD" value={Math.round(avgTd).toLocaleString()} sub="m" accent="#43A047" />
            <StatCard label="팀 평균 HSR" value={Math.round(avgHsr).toLocaleString()} sub="m" accent="#00A651" />
            <StatCard label="평균 RPE" value={avgRpe ? avgRpe.toFixed(1) : '—'} sub="/ 10" accent="#FB8C00" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5 chart-grid-2">
            <div className="chart-card">
              <div className="chart-title">선수별 TD</div>
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 22)}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
                  <YAxis dataKey="name" type="category" width={55} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toLocaleString()} m`, 'TD']}
                    contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }}
                  />
                  <Bar dataKey="td" fill="rgba(107, 63, 160, 0.35)" radius={[0, 3, 3, 0]} stroke="rgba(107, 63, 160, 0.7)" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <div className="chart-title">선수별 HSR / Sprint</div>
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 22)}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
                  <YAxis dataKey="name" type="category" width={55} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
                  <Bar dataKey="hsr" fill="rgba(0, 166, 81, 0.35)" radius={[0, 3, 3, 0]} name="HSR(m)" />
                  <Bar dataKey="sprint" fill="rgba(251, 140, 0, 0.35)" radius={[0, 3, 3, 0]} name="Sprint(m)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">{selectedDate} 선수별 상세</div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>선수</th>
                    <th className="right">TD(m)</th>
                    <th className="right">HSR(m)</th>
                    <th className="right">Sprint(m)</th>
                    <th className="right">m/min</th>
                    <th className="right">RPE</th>
                    <th className="right">Acc</th>
                    <th className="right">Dec</th>
                    <th className="right">Max Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} onClick={() => row.player_id && navigate(`/player/${row.player_id}`)}>
                      <td className="name">{row.player_name}</td>
                      <td className="num">{Math.round(row.total_distance).toLocaleString()}</td>
                      <td className="num">{Math.round(row.hsr_distance).toLocaleString()}</td>
                      <td className="num">{Math.round(row.sprint_distance).toLocaleString()}</td>
                      <td className="num">{row.m_per_min ? Number(row.m_per_min).toFixed(1) : '—'}</td>
                      <td className="num">{row.rpe ?? '—'}</td>
                      <td className="num">{row.acc_count || '—'}</td>
                      <td className="num">{row.dec_count || '—'}</td>
                      <td className="num">{row.max_speed ? Number(row.max_speed).toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
