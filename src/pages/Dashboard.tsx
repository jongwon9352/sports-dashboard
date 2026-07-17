import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchPlayersWithAcwr, fetchCalendarEvents, fetchAllPlayersAcwrMultiMetric,
  type CalendarEvent, type TeamAcwrSeries,
} from '../lib/api';
import { getAcwrZone, ZONE_COLOR, METRIC_KEYS } from './TeamDashboard';
import { colors } from '../styles/colors';
import type { PlayerWithAcwr } from '../types';

// ── 날짜 유틸 ──────────────────────────────────────────────────────────
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

type CalendarTab = 'month' | 'week' | 'day';

// ── 캘린더 ─────────────────────────────────────────────────────────────
function CalendarSection({ events }: { events: CalendarEvent[] }) {
  const [tab, setTab] = useState<CalendarTab>('week');
  const [cursor, setCursor] = useState(new Date());

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  const navigate = (dir: 1 | -1) => {
    if (tab === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else if (tab === 'week') setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  };

  const titleLabel = tab === 'month'
    ? `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
    : tab === 'week'
    ? `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
    : toDateStr(cursor);

  const EventBlock = ({ e }: { e: CalendarEvent }) => (
    <div
      className="text-[11px] px-2 py-1 rounded mb-1 truncate text-white"
      style={{ background: e.type === 'match' ? colors.green : colors.navy }}
      title={e.label}
    >
      {e.label}
    </div>
  );

  return (
    <div className="chart-card mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="chart-title !mb-0">캘린더</div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="px-2 py-1 rounded border border-surface-secondary hover:bg-surface-secondary">‹</button>
          <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-data)' }}>{titleLabel}</span>
          <button onClick={() => navigate(1)} className="px-2 py-1 rounded border border-surface-secondary hover:bg-surface-secondary">›</button>
        </div>
        <div className="flex gap-2">
          {([['month', '월간'], ['week', '주간'], ['day', '일정']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                tab === id ? 'bg-purple text-white' : 'border border-surface-secondary hover:bg-surface-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'week' && (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map(d => {
            const dateStr = toDateStr(d);
            const isToday = dateStr === toDateStr(new Date());
            return (
              <div key={dateStr} className="min-h-[140px] rounded-lg border border-surface-secondary p-2">
                <div className="text-[10px] text-text-disabled">{DOW[d.getDay()]}</div>
                <div className={`text-sm font-bold mb-1 ${isToday ? 'text-purple' : ''}`}>{d.getDate()}</div>
                {(eventsByDate.get(dateStr) ?? []).map((e, i) => <EventBlock key={i} e={e} />)}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'month' && (
        <div className="grid grid-cols-7 gap-2">
          {DOW.map(d => <div key={d} className="text-[10px] text-text-disabled text-center">{d}</div>)}
          {Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(startOfMonth(cursor)), i)).map(d => {
            const dateStr = toDateStr(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = dateStr === toDateStr(new Date());
            const dayEvents = eventsByDate.get(dateStr) ?? [];
            return (
              <div key={dateStr} className={`min-h-[80px] rounded-lg border border-surface-secondary p-1.5 ${inMonth ? '' : 'opacity-40'}`}>
                <div className={`text-xs font-bold mb-0.5 ${isToday ? 'text-purple' : ''}`}>{d.getDate()}</div>
                {dayEvents.slice(0, 2).map((e, i) => <EventBlock key={i} e={e} />)}
                {dayEvents.length > 2 && <div className="text-[10px] text-text-disabled">+{dayEvents.length - 2}건 더</div>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'day' && (
        <div className="space-y-2">
          {(eventsByDate.get(toDateStr(cursor)) ?? []).length === 0 ? (
            <p className="text-sm text-text-secondary py-8 text-center">이 날짜에는 등록된 훈련·경기 기록이 없습니다.</p>
          ) : (
            (eventsByDate.get(toDateStr(cursor)) ?? []).map((e, i) => (
              <div key={i} className="rounded-lg p-3 text-sm text-white" style={{ background: e.type === 'match' ? colors.green : colors.navy }}>
                {e.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── 선수 현황 바 ───────────────────────────────────────────────────────
function suggestedLoad(series: TeamAcwrSeries[]): number {
  const today = series[series.length - 1];
  const yesterday = series[series.length - 2];
  const ACUTE_LAMBDA = 0.25;
  const chronicToday = today?.chronic ?? 0;
  const acutePrev = yesterday?.acute ?? 0;
  return Math.max(0, Math.round((chronicToday - (1 - ACUTE_LAMBDA) * acutePrev) / ACUTE_LAMBDA));
}

function PlayerStatusBar({ players, acwrMap }: {
  players: PlayerWithAcwr[];
  acwrMap: Map<string, Record<string, TeamAcwrSeries[]>>;
}) {
  const navigate = useNavigate();
  return (
    <div className="chart-card">
      <div className="chart-title">선수 현황</div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>선수명</th>
              {METRIC_KEYS.map(({ key, label }) => <th key={key} className="right">{label} ACWR</th>)}
              <th className="right">오늘 훈련 제안</th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => {
              const multi = acwrMap.get(p.id);
              return (
                <tr key={p.id} onClick={() => navigate(`/player/${p.id}`)} style={{ cursor: 'pointer' }}>
                  <td className="name">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: colors.navy }}>
                        {p.jersey_number ?? '–'}
                      </div>
                      {p.name} <span className="text-text-secondary text-xs ml-1">{p.position}</span>
                    </div>
                  </td>
                  {METRIC_KEYS.map(({ key }) => {
                    const series = multi?.[key] ?? [];
                    const entry = [...series].reverse().find(d => d.chronic > 0) ?? null;
                    const val = entry ? +((entry.acute / entry.chronic).toFixed(2)) : null;
                    const zone = getAcwrZone(val);
                    return (
                      <td key={key} className="num font-bold" style={{ color: val != null ? ZONE_COLOR[zone] : undefined }}>
                        {val != null ? val.toFixed(2) : '—'}
                      </td>
                    );
                  })}
                  <td className="num font-bold" style={{ color: colors.warning }}>
                    {multi?.tl ? `${suggestedLoad(multi.tl).toLocaleString()} AU` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [players, setPlayers] = useState<PlayerWithAcwr[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [acwrMap, setAcwrMap] = useState<Map<string, Record<string, TeamAcwrSeries[]>>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    Promise.all([
      fetchPlayersWithAcwr(),
      fetchCalendarEvents(toDateStr(start), toDateStr(end)),
      fetchAllPlayersAcwrMultiMetric(90),
    ]).then(([p, ev, multi]) => {
      setPlayers(p);
      setEvents(ev);
      setAcwrMap(multi as Map<string, Record<string, TeamAcwrSeries[]>>);
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

  return (
    <div className="p-6">
      <div className="sec-title">홈</div>
      <CalendarSection events={events} />
      <PlayerStatusBar players={players} acwrMap={acwrMap} />
    </div>
  );
}
