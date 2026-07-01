import { useEffect, useMemo, useState } from 'react';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, BarChart,
} from 'recharts';
import { fetchMatchData, type MatchRow } from '../lib/api';

// ── 상수 ──────────────────────────────────────────────────────────────────
const FULL_TIME = 80; // 풀 타임 기준 분

// event_type 정규화 (DB에 대소문자/띄어쓰기 혼재)
function normalizeEventType(et: string): string {
  return et.replace(/\s/g, '').toLowerCase();
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  'k리그주니어': 'K리그주니어',
  '연습경기':   '연습경기',
  '소체예선':   '소체예선',
  '울진대회':   '울진대회',
  '남해스토브리그': '남해스토브리그',
  '소년체전':   '소년체전',
};

const GROUPS = ['전체', 'U15', 'U14', 'U13', 'U15/14'];

// ── 풀 타임 정규화 ─────────────────────────────────────────────────────────
function norm(val: number, time: number) {
  return time > 0 ? (val * FULL_TIME) / time : 0;
}

function round1(n: number) { return Math.round(n * 10) / 10; }

// ── 집계 헬퍼 ──────────────────────────────────────────────────────────────
function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

interface AggRow {
  label: string;
  td: number;
  mPerMin: number;
  hsr: number;
  sprint: number;
  acc: number;
  dec: number;
  acdLoad: number;
  maxSpeed: number;
}

function aggregateByMatch(rows: MatchRow[]): AggRow[] {
  const map = new Map<string, MatchRow[]>();
  for (const r of rows) {
    const key = `${r.match_date}__${r.opponent ?? '미정'}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return [...map.entries()].map(([key, group]) => {
    const sepIdx = key.indexOf('__');
    const date = key.slice(0, sepIdx);
    const opponent = key.slice(sepIdx + 2);
    const dt = new Date(date);
    const label = `${opponent}\n${dt.getMonth() + 1}/${dt.getDate()}`;
    return {
      label,
      td:       round1(avg(group.map(r => norm(r.total_distance, r.play_time_min)))),
      mPerMin:  round1(avg(group.map(r => r.m_per_min))),
      hsr:      round1(avg(group.map(r => norm(r.hsr_distance, r.play_time_min)))),
      sprint:   round1(avg(group.map(r => norm(r.sprint_distance, r.play_time_min)))),
      acc:      round1(avg(group.map(r => norm(r.acc_count, r.play_time_min)))),
      dec:      round1(avg(group.map(r => norm(r.dec_count, r.play_time_min)))),
      acdLoad:  round1(avg(group.map(r => norm(r.acd_load, r.play_time_min)))),
      maxSpeed: round1(avg(group.map(r => r.max_speed))),
    };
  });
}

function aggregateByPlayer(rows: MatchRow[]): AggRow[] {
  const map = new Map<string, MatchRow[]>();
  for (const r of rows) {
    if (!map.has(r.player_name)) map.set(r.player_name, []);
    map.get(r.player_name)!.push(r);
  }
  return [...map.entries()]
    .map(([name, group]) => ({
      label:    name,
      td:       round1(avg(group.map(r => norm(r.total_distance, r.play_time_min)))),
      mPerMin:  round1(avg(group.map(r => r.m_per_min))),
      hsr:      round1(avg(group.map(r => norm(r.hsr_distance, r.play_time_min)))),
      sprint:   round1(avg(group.map(r => norm(r.sprint_distance, r.play_time_min)))),
      acc:      round1(avg(group.map(r => norm(r.acc_count, r.play_time_min)))),
      dec:      round1(avg(group.map(r => norm(r.dec_count, r.play_time_min)))),
      acdLoad:  round1(avg(group.map(r => norm(r.acd_load, r.play_time_min)))),
      maxSpeed: round1(avg(group.map(r => r.max_speed))),
    }))
    .sort((a, b) => b.td - a.td);
}

// ── 공통 차트 설정 ──────────────────────────────────────────────────────────
const AXIS_STYLE = { fontSize: 10, fill: '#6b7280' };
const CHART_MARGIN = { top: 12, right: 8, left: 0, bottom: 48 };

function XTick({ x, y, payload }: any) {
  const lines: string[] = (payload.value as string).split('\n');
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="end" transform="rotate(-35)" style={AXIS_STYLE}>
        {lines[0]}
      </text>
      {lines[1] && (
        <text x={0} y={0} dy={24} textAnchor="end" transform="rotate(-35)" style={{ ...AXIS_STYLE, fill: '#9ca3af' }}>
          {lines[1]}
        </text>
      )}
    </g>
  );
}

// ── 5개 차트 패널 ──────────────────────────────────────────────────────────
function TdChart({ data, height }: { data: AggRow[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={<XTick />} interval={0} height={52} />
        <YAxis yAxisId="td" width={48} unit="m" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="mm" orientation="right" width={40} unit="" tick={{ fontSize: 10 }} />
        <Tooltip formatter={((v: any, name: any) => [v, name === 'td' ? 'TD (m)' : 'm/min']) as any} />
        <Bar yAxisId="td" dataKey="td" fill="#22c55e" name="TD" radius={[2, 2, 0, 0]} />
        <Line yAxisId="mm" dataKey="mPerMin" stroke="#f97316" dot={{ r: 3 }} strokeWidth={2} name="m/min" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function HirChart({ data, height }: { data: AggRow[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={<XTick />} interval={0} height={52} />
        <YAxis width={48} unit="m" tick={{ fontSize: 10 }} />
        <Tooltip formatter={((v: any, name: any) => [v, name === 'hsr' ? 'HSR (m)' : 'Sprint (m)']) as any} />
        <Bar dataKey="hsr" stackId="hir" fill="#f9a8d4" name="hsr" radius={[0, 0, 0, 0]} />
        <Bar dataKey="sprint" stackId="hir" fill="#ef4444" name="sprint" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActionChart({ data, height }: { data: AggRow[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={<XTick />} interval={0} height={52} />
        <YAxis width={48} tick={{ fontSize: 10 }} />
        <Tooltip formatter={((v: any, name: any) => [v, name === 'acc' ? 'ACC' : 'DEC']) as any} />
        <Bar dataKey="dec" stackId="act" fill="#3b82f6" name="dec" />
        <Bar dataKey="acc" stackId="act" fill="#f97316" name="acc" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function IntensityChart({ data, height }: { data: AggRow[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={<XTick />} interval={0} height={52} />
        <YAxis width={48} tick={{ fontSize: 10 }} />
        <Tooltip formatter={((v: any) => [v, 'ACD Load']) as any} />
        <Bar dataKey="acdLoad" fill="#b91c1c" name="acdLoad" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpeedChart({ data, height }: { data: AggRow[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={<XTick />} interval={0} height={52} />
        <YAxis width={48} unit="km/h" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
        <Tooltip formatter={((v: any) => [v, 'Max Speed (km/h)']) as any} />
        <Line dataKey="maxSpeed" stroke="#60a5fa" dot={{ r: 4, fill: '#60a5fa' }} strokeWidth={2} name="maxSpeed" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 차트 행 레이블 ─────────────────────────────────────────────────────────
const CHART_ROWS = [
  { label: 'TD & M/min', sub: '(m / m·min⁻¹)' },
  { label: 'HIR',        sub: '(HSR + Sprint, m)' },
  { label: 'Action',     sub: '(ACC + DEC)' },
  { label: 'Intensity',  sub: '(ACD Load)' },
  { label: 'Speed',      sub: '(km/h)' },
] as const;

type ChartKey = 0 | 1 | 2 | 3 | 4;

function ChartByIndex({ index, data, height }: { index: ChartKey; data: AggRow[]; height: number }) {
  if (index === 0) return <TdChart data={data} height={height} />;
  if (index === 1) return <HirChart data={data} height={height} />;
  if (index === 2) return <ActionChart data={data} height={height} />;
  if (index === 3) return <IntensityChart data={data} height={height} />;
  return <SpeedChart data={data} height={height} />;
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export default function MatchTab() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<string>('전체');
  const [selectedGroup, setSelectedGroup] = useState<string>('전체');

  useEffect(() => {
    fetchMatchData().then(data => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  // 고유 경기 타입 목록
  const eventTypes = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = ['전체'];
    for (const r of rows) {
      const norm = normalizeEventType(r.event_type);
      const label = EVENT_TYPE_LABELS[norm] ?? r.event_type;
      if (!seen.has(norm)) { seen.add(norm); result.push(label); }
    }
    return result;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const eventMatch = selectedEvent === '전체'
        || normalizeEventType(r.event_type) === normalizeEventType(selectedEvent);
      const groupMatch = selectedGroup === '전체' || r.player_group === selectedGroup;
      return eventMatch && groupMatch;
    });
  }, [rows, selectedEvent, selectedGroup]);

  const matchData  = useMemo(() => aggregateByMatch(filtered), [filtered]);
  const playerData = useMemo(() => aggregateByPlayer(filtered), [filtered]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>;
  }

  const CHART_H = 200;

  return (
    <div className="p-4 space-y-4">
      {/* 필터 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-16">경기 타입</span>
          {eventTypes.map(et => (
            <button
              key={et}
              onClick={() => setSelectedEvent(et)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedEvent === et
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {et}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-16">그룹</span>
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedGroup === g
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">
          {filtered.length}개 레코드 · {matchData.length}경기 · {playerData.length}명 · 풀 타임 {FULL_TIME}분 기준 평균
        </p>
      </div>

      {/* 차트 그리드 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 왼쪽: 경기별 팀 평균 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-1">TEAM AVG. DATA (경기별)</h3>
          <p className="text-[11px] text-gray-400 mb-4">풀 타임 {FULL_TIME}분 기준 평균</p>
          <div className="space-y-2">
            {CHART_ROWS.map((row, i) => (
              <div key={i}>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-xs font-semibold text-gray-600">{row.label}</span>
                  <span className="text-[10px] text-gray-400">{row.sub}</span>
                </div>
                {/* 경기 수가 많으면 가로 스크롤 */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: Math.max(400, matchData.length * 40) }}>
                    <ChartByIndex index={i as ChartKey} data={matchData} height={CHART_H} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽: 선수별 개인 데이터 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-1">TEAM DATA (선수별)</h3>
          <p className="text-[11px] text-gray-400 mb-4">풀 타임 {FULL_TIME}분 기준 평균 · TD 내림차순</p>
          <div className="space-y-2">
            {CHART_ROWS.map((row, i) => (
              <div key={i}>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-xs font-semibold text-gray-600">{row.label}</span>
                  <span className="text-[10px] text-gray-400">{row.sub}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: Math.max(400, playerData.length * 44) }}>
                    <ChartByIndex index={i as ChartKey} data={playerData} height={CHART_H} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
