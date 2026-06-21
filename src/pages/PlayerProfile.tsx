import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  fetchPlayersWithAcwr, fetchPlayerAcwrHistory,
  fetchPlayerDailyData, fetchPlayerMatchHistory,
} from '../lib/api';
import { StatCard } from '../components/StatCard';
import { getZoneColor, getZoneLabel } from '../utils/calculations';
import type { PlayerWithAcwr, AcwrDaily, TrainingDaily, MatchData } from '../types';

export function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerWithAcwr | null>(null);
  const [acwrHistory, setAcwrHistory] = useState<AcwrDaily[]>([]);
  const [dailyData, setDailyData] = useState<TrainingDaily[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchPlayersWithAcwr(),
      fetchPlayerAcwrHistory(id),
      fetchPlayerDailyData(id),
      fetchPlayerMatchHistory(id),
    ]).then(([players, history, daily, matchData]) => {
      setPlayer(players.find(p => p.id === id) ?? null);
      setAcwrHistory(history);
      setDailyData(daily);
      setMatches(matchData);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">Loading...</div>;
  }

  if (!player) {
    return (
      <div className="p-8">
        <Link to="/" className="text-purple text-sm mb-4 inline-block">&larr; 대시보드로 돌아가기</Link>
        <p>선수를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const chartAcwr = acwrHistory.slice(-30).map(a => ({
    date: a.date.slice(5),
    acwr: +Number(a.acwr).toFixed(2),
    acute: Math.round(Number(a.acute_ewma)),
    chronic: Math.round(Number(a.chronic_ewma)),
    load: Number(a.daily_load),
  }));

  const thresholds = {
    Post: { green: 1.3, red: 1.5 },
    Pre: { green: 1.2, red: 1.4 },
    Mid: { green: 1.1, red: 1.3 },
  }[player.maturity_status ?? 'Mid']!;

  const recentDaily = dailyData.slice(0, 14).reverse();
  const dailyChart = recentDaily.map(d => ({
    date: d.training_date.slice(5),
    td: Number(d.total_distance),
    hsr: Number(d.hsr_distance),
    sprint: Number(d.sprint_distance),
  }));

  const latestDaily = dailyData[0];

  return (
    <div className="p-6">
      <Link to="/" className="text-purple text-sm mb-4 inline-block">&larr; 대시보드</Link>

      <div className="chart-card flex items-center gap-5 mb-5">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${getZoneColor(player.acwr_zone)}, #6B3FA0)` }}
        >
          {player.jersey_number ?? '–'}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{player.name}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-text-secondary text-sm">{player.position} · {player.grade}</span>
            <MaturityPill status={player.maturity_status ?? 'Mid'} />
            <span
              className="zone-badge"
              style={{
                color: getZoneColor(player.acwr_zone),
                background: `${getZoneColor(player.acwr_zone)}15`,
              }}
            >
              {getZoneLabel(player.acwr_zone)}
              {player.acwr_data?.acwr != null && ` ${Number(player.acwr_data.acwr).toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-5 stat-grid-4">
        <StatCard
          label="ACWR"
          value={player.acwr_data?.acwr != null ? Number(player.acwr_data.acwr).toFixed(2) : '—'}
          accent={getZoneColor(player.acwr_zone)}
          valueColor={getZoneColor(player.acwr_zone)}
        />
        <StatCard label="Acute Load" value={player.acwr_data?.acute_ewma ? Number(player.acwr_data.acute_ewma).toFixed(0) : '—'} accent="#E53935" />
        <StatCard label="Chronic Load" value={player.acwr_data?.chronic_ewma ? Number(player.acwr_data.chronic_ewma).toFixed(0) : '—'} accent="#1E88E5" />
        <StatCard label="오늘 부하" value={player.acwr_data?.daily_load ? Number(player.acwr_data.daily_load).toFixed(0) : '—'} accent="#6B3FA0" />
        <StatCard
          label="Monotony"
          value={player.monotony?.toFixed(2) ?? '—'}
          accent={player.monotony && player.monotony > 2 ? '#E53935' : '#607D8B'}
          valueColor={player.monotony && player.monotony > 2 ? '#E53935' : undefined}
        />
      </div>

      {chartAcwr.length > 0 && (
        <div className="chart-card mb-4">
          <div className="chart-title">ACWR 추이 (최근 30일)</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartAcwr}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis domain={[0, 2.5]} tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <ReferenceLine y={0.8} stroke="#FB8C00" strokeDasharray="4 4" label={{ value: '하한', fontSize: 9 }} />
              <ReferenceLine y={thresholds.green} stroke="#43A047" strokeDasharray="4 4" label={{ value: '안전상한', fontSize: 9 }} />
              <ReferenceLine y={thresholds.red} stroke="#E53935" strokeDasharray="4 4" label={{ value: '위험', fontSize: 9 }} />
              <Line type="monotone" dataKey="acwr" stroke="#6B3FA0" strokeWidth={2.5} dot={false} name="ACWR" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartAcwr.length > 0 && (
        <div className="chart-card mb-4">
          <div className="chart-title">Acute / Chronic Load 추이</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartAcwr}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Line type="monotone" dataKey="acute" stroke="#E53935" strokeWidth={2} dot={false} name="Acute" />
              <Line type="monotone" dataKey="chronic" stroke="#1E88E5" strokeWidth={2} dot={false} name="Chronic" />
              <Line type="monotone" dataKey="load" stroke="#9AA0A6" strokeWidth={1} dot={false} name="Daily Load" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {dailyChart.length > 0 && (
        <div className="chart-card mb-4">
          <div className="chart-title">최근 훈련 TD / HSR / Sprint</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Bar dataKey="td" fill="rgba(107, 63, 160, 0.3)" radius={[3, 3, 0, 0]} name="TD(m)" />
              <Bar dataKey="hsr" fill="rgba(0, 166, 81, 0.3)" radius={[3, 3, 0, 0]} name="HSR(m)" />
              <Bar dataKey="sprint" fill="rgba(251, 140, 0, 0.3)" radius={[3, 3, 0, 0]} name="Sprint(m)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {latestDaily && (
        <div className="chart-card mb-4">
          <div className="chart-title">최근 훈련 데이터 ({latestDaily.training_date})</div>
          <div className="grid grid-cols-4 gap-4 stat-grid-4">
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>총 뛴 거리</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.total_distance).toLocaleString()} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>HSR</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.hsr_distance).toFixed(1)} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>Sprint</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.sprint_distance).toFixed(1)} m</p>
            </div>
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>최고 속도</p>
              <p className="text-lg font-bold mt-1">{Number(latestDaily.max_speed).toFixed(1)} km/h</p>
            </div>
          </div>
        </div>
      )}

      {matches.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">경기 기록 ({matches.length}경기)</div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>대회</th>
                  <th>상대</th>
                  <th>포지션</th>
                  <th className="right">출전(분)</th>
                  <th className="right">TD(m)</th>
                  <th className="right">HSR(m)</th>
                  <th className="right">Sprint(m)</th>
                  <th className="right">Max Speed</th>
                  <th className="right">RPE</th>
                </tr>
              </thead>
              <tbody>
                {matches.map(m => (
                  <tr key={m.id} style={{ cursor: 'default' }}>
                    <td style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>{m.match_date}</td>
                    <td>{m.event_type}</td>
                    <td className="name">{m.opponent}</td>
                    <td>{m.position_played ?? '—'}</td>
                    <td className="num">{Number(m.play_time_min) || '—'}</td>
                    <td className="num">{Number(m.total_distance) ? Math.round(Number(m.total_distance)).toLocaleString() : '—'}</td>
                    <td className="num">{Number(m.hsr_distance) ? Math.round(Number(m.hsr_distance)).toLocaleString() : '—'}</td>
                    <td className="num">{Number(m.sprint_distance) ? Math.round(Number(m.sprint_distance)).toLocaleString() : '—'}</td>
                    <td className="num">{Number(m.max_speed) ? Number(m.max_speed).toFixed(1) : '—'}</td>
                    <td className="num">{m.rpe ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MaturityPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; text: string }> = {
    Pre: { label: 'Pre-PHV', bg: '#E3F2FD', text: '#1565C0' },
    Mid: { label: 'Mid-PHV', bg: '#FFF3E0', text: '#E65100' },
    Post: { label: 'Post-PHV', bg: '#E8F5E9', text: '#2E7D32' },
  };
  const c = cfg[status] ?? cfg.Mid;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}
