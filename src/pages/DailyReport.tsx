import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { fetchAvailableDates, fetchDailyReportData, fetchDayTarget } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { colors } from '../styles/colors';
import type { DailyReportRow } from '../types';

const TRAINING_TYPES = ['TR', 'GAME', 'RE', 'OFF', '1학년', '2학년', '3학년'] as const;
type TrainingType = typeof TRAINING_TYPES[number];

function fmtN(v: number): string { return v ? Math.round(v).toLocaleString() : '0'; }
function fmtD(v: number, d = 1): string { return v ? Number(v).toFixed(d) : '0'; }
function avgOf(rows: DailyReportRow[], fn: (r: DailyReportRow) => number): number {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + fn(r), 0) / rows.length;
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}(${days[d.getDay()]})`;
}

function AvgRow({ label, rows, cls }: { label: string; rows: DailyReportRow[]; cls: { name: string; td: string } }) {
  if (!rows.length) return null;
  return (
    <tr className="bg-surface-secondary/20">
      <td className={`${cls.name} sticky left-0 bg-surface-secondary/20 z-10`}>{label}</td>
      <td className={cls.name}></td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.duration_min), 1)}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.total_distance))}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.m_per_min), 1)}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.hsr_distance))}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.hsr_custom))}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.sprint_distance))}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.sprint_custom))}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.sprint_count), 1)}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.sprint_count_custom), 1)}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.acc_count), 1)}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.dec_count), 1)}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.acc_count + r.dec_count), 1)}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.acd_load))}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.max_speed), 1)}</td>
    </tr>
  );
}

interface OverlayChartProps {
  title: string;
  data: { name: string; value: number; target: number }[];
  color: string;
  unit?: string;
  targetLabel?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DualBarShape(color: string) {
  return (props: any) => {
    const { x, y, width, height, payload } = props;
    if (!width) return null;
    const target = payload?.target ?? 0;
    const value = payload?.value ?? 0;
    if (!value && !target) return null;

    const scale = height / value;
    const goalH = target > 0 ? target * scale : 0;
    const baseY = y + height;

    return (
      <g>
        {target > 0 && (
          <rect x={x} y={baseY - goalH} width={width} height={goalH}
            fill="transparent" stroke="#cc0000" strokeWidth={2} rx={2} />
        )}
        <rect x={x + 2} y={y} width={width - 4} height={height}
          fill={color} rx={2} />
        <text x={x + width / 2} y={y - 6} textAnchor="middle"
          fontSize={9} fontFamily="DM Mono" fill="var(--color-text-secondary)">
          {Math.round(value).toLocaleString()}
        </text>
      </g>
    );
  };
}

function OverlayChart({ title, data, color, unit = '', targetLabel }: OverlayChartProps) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const hasTarget = sorted.some(d => d.target > 0);
  const maxVal = Math.max(...sorted.map(d => Math.max(d.value, d.target)), 1);
  const yDomain: [number, number] = [0, Math.ceil(maxVal * 1.15)];

  return (
    <div className="chart-card">
      <div className="chart-title text-center">{title}</div>
      <div className="flex items-center justify-center gap-4 mb-2">
        <span className="flex items-center gap-1 text-[10px]">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} /> Real
        </span>
        {hasTarget && (
          <span className="flex items-center gap-1 text-[10px]">
            <span className="inline-block w-3 h-3 border-2 border-red-600 rounded-sm bg-transparent" /> Goal{targetLabel ? ` (${targetLabel})` : ''}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={sorted} margin={{ top: 25, right: 10, bottom: 50, left: 10 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={55} />
          <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} domain={yDomain} />
          <Tooltip
            formatter={(v) => [`${Number(v).toLocaleString()}${unit}`, 'Real']}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }}
          />
          {hasTarget && (
            <ReferenceLine y={sorted[0]?.target} stroke="#cc0000" strokeDasharray="5 3" strokeWidth={1} />
          )}
          <Bar dataKey="value" shape={DualBarShape(color)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompareChart({
  title, data, label1, label2, color1, color2, unit = '',
}: {
  title: string;
  data: { name: string; basic: number; custom: number }[];
  label1: string; label2: string;
  color1: string; color2: string;
  unit?: string;
}) {
  const sorted = [...data].sort((a, b) => b.basic - a.basic);
  return (
    <div className="chart-card">
      <div className="chart-title text-center">{title}</div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={sorted} margin={{ top: 10, right: 10, bottom: 50, left: 10 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={55} />
          <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}${unit}`]}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="basic" name={label1} fill={color1} barSize={16} radius={[2, 2, 0, 0]} />
          <Bar dataKey="custom" name={label2} fill={color2} barSize={16} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyReport() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => sessionStorage.getItem('dailyReportDate') || '');
  const [data, setData] = useState<DailyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(() => sessionStorage.getItem('dailyReportLocation') || '');
  const [playerTypes, setPlayerTypes] = useState<Record<string, TrainingType>>(() => {
    const savedDate = sessionStorage.getItem('dailyReportDate') || '';
    try { return JSON.parse(sessionStorage.getItem(`dailyTypes_${savedDate}`) || '{}'); } catch { return {}; }
  });
  const [targets, setTargets] = useState<{ td: number; hsr: number; sprint: number } | null>(null);
  const navigate = useNavigate();

  const loadTypesForDate = (date: string) => {
    try {
      const saved = sessionStorage.getItem(`dailyTypes_${date}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  };

  useEffect(() => {
    fetchAvailableDates().then(d => {
      setDates(d);
      const saved = sessionStorage.getItem('dailyReportDate');
      const dateToUse = saved && d.includes(saved) ? saved : d[0] || '';
      if (dateToUse) {
        setSelectedDate(dateToUse);
        setPlayerTypes(loadTypesForDate(dateToUse));
        fetchDailyReportData(dateToUse).then(rows => { setData(rows); setLoading(false); });
        fetchDayTarget(dateToUse).then(setTargets);
      } else { setLoading(false); }
    });
  }, []);

  useEffect(() => { if (selectedDate) sessionStorage.setItem('dailyReportDate', selectedDate); }, [selectedDate]);
  useEffect(() => { sessionStorage.setItem('dailyReportLocation', location); }, [location]);
  useEffect(() => {
    if (selectedDate) sessionStorage.setItem(`dailyTypes_${selectedDate}`, JSON.stringify(playerTypes));
  }, [playerTypes, selectedDate]);

  const handleDateChange = (date: string) => {
    if (selectedDate) sessionStorage.setItem(`dailyTypes_${selectedDate}`, JSON.stringify(playerTypes));
    setSelectedDate(date);
    setPlayerTypes(loadTypesForDate(date));
    setLoading(true);
    fetchDailyReportData(date).then(rows => { setData(rows); setLoading(false); });
    fetchDayTarget(date).then(setTargets);
  };

  const setType = (playerId: string, type: TrainingType) => {
    setPlayerTypes(prev => ({ ...prev, [playerId]: type }));
  };

  const sortedData = useMemo(() =>
    [...data].sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)),
  [data]);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgTd = avg(data.map(d => d.total_distance));
  const avgHsr = avg(data.map(d => d.hsr_distance));
  const rpes = data.filter(d => d.rpe != null).map(d => d.rpe!);
  const avgRpe = avg(rpes);

  const grade3Rows = useMemo(() =>
    sortedData.filter(r => playerTypes[r.player_id] === '3학년'),
  [sortedData, playerTypes]);

  const tdTarget = targets?.td ?? 0;
  const hsrTarget = targets?.hsr ?? 0;
  const sprintTarget = targets?.sprint ?? 0;

  const mkChart = (fn: (r: DailyReportRow) => number, target: number) =>
    grade3Rows.map(d => ({ name: d.player_name, value: Math.round(fn(d)), target }));

  const usedTypes = [...new Set(Object.values(playerTypes))].sort();
  const rowsByType = (type: TrainingType) => sortedData.filter(r => playerTypes[r.player_id] === type);

  const thC = 'px-2 py-2 text-[11px] font-semibold whitespace-nowrap border-b border-surface-secondary';
  const tdC = 'px-2 py-1.5 text-[11px] whitespace-nowrap border-b border-surface-secondary text-right';
  const tdNameC = 'px-2 py-1.5 text-[11px] font-medium whitespace-nowrap border-b border-surface-secondary';
  const avgTdC = 'px-2 py-2 text-[11px] font-bold whitespace-nowrap border-t-2 border-surface-secondary text-right';
  const avgNameC = 'px-2 py-2 text-[11px] font-bold whitespace-nowrap border-t-2 border-surface-secondary';

  const typeLabels: Record<TrainingType, string> = {
    TR: '훈련조', GAME: '경기조', RE: '회복조', OFF: 'OFF',
    '1학년': '1학년', '2학년': '2학년', '3학년': '3학년',
  };

  const pdfTableRef = useRef<HTMLDivElement>(null);
  const pdfChart1Ref = useRef<HTMLDivElement>(null);
  const pdfChart2Ref = useRef<HTMLDivElement>(null);
  const pdfChart3Ref = useRef<HTMLDivElement>(null);

  const handlePDF = useCallback(async () => {
    const refs = [pdfTableRef, pdfChart1Ref, pdfChart2Ref, pdfChart3Ref];
    const pdfW = 2784 * 0.264583;
    const pdfH = 1608 * 0.264583;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pdfW, pdfH] });

    for (let i = 0; i < refs.length; i++) {
      const el = refs[i].current;
      if (!el) continue;
      if (i > 0) pdf.addPage([pdfW, pdfH], 'landscape');
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#1a1a2e', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    }

    pdf.save(`데일리리포트_${selectedDate}.pdf`);
  }, [selectedDate]);

  const hasType = (id: string) => !!playerTypes[id];

  return (
    <div className="p-6">
      <div className="sec-title">데일리 리포트</div>

      <div className="flex items-center gap-3 mb-5">
        <label className="text-[10px] tracking-[1px] uppercase text-text-disabled" style={{ fontFamily: 'var(--font-data)' }}>
          날짜 선택
        </label>
        <select value={selectedDate} onChange={e => handleDateChange(e.target.value)}
          className="px-3 py-1.5 border border-surface-secondary rounded-[var(--radius-sm)] text-sm bg-white outline-none focus:border-purple"
          style={{ fontFamily: 'var(--font-data)' }}>
          {dates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {sortedData.length > 0 && (
          <button onClick={handlePDF}
            className="ml-auto px-4 py-1.5 text-sm rounded border border-surface-secondary hover:bg-surface-secondary transition-colors flex items-center gap-1.5">
            📥 PDF 다운로드
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-text-secondary text-center py-16">Loading...</div>
      ) : (
        <>
          {/* Page 1: 테이블 */}
          {sortedData.length > 0 && (
            <div ref={pdfTableRef} className="chart-card mb-5">
              <div className="text-center mb-3">
                <div className="chart-title mb-1">- 선수별 데이터 -</div>
                <div className="flex items-center justify-center gap-6 flex-wrap">
                  <span className="text-xs text-text-secondary">일시: {formatKoreanDate(selectedDate)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-secondary">장소:</span>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="장소 입력" className="px-2 py-0.5 text-xs rounded border border-surface-secondary bg-transparent w-36 outline-none" />
                  </div>
                  <span className="text-xs text-text-secondary">인원: {sortedData.filter(r => hasType(r.player_id)).length}명</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-data)' }}>
                  <thead>
                    <tr className="bg-surface-secondary/40">
                      <th className={`${thC} text-left sticky left-0 bg-surface z-10`}>선수명</th>
                      <th className={`${thC} text-center`} style={{ minWidth: 60 }}></th>
                      <th className={`${thC} text-right`}>시간</th>
                      <th className={`${thC} text-right`}>총 이동거리</th>
                      <th className={`${thC} text-right`}>분당 이동거리</th>
                      <th className={`${thC} text-right`}>고강도 이동거리</th>
                      <th className={`${thC} text-right`}>고강도 이동거리(custom)</th>
                      <th className={`${thC} text-right`}>스프린트 거리</th>
                      <th className={`${thC} text-right`}>스프린트 거리(custom)</th>
                      <th className={`${thC} text-right`}>스프린트 횟수</th>
                      <th className={`${thC} text-right`}>스프린트 횟수(custom)</th>
                      <th className={`${thC} text-right`}>가속 횟수</th>
                      <th className={`${thC} text-right`}>감속 횟수</th>
                      <th className={`${thC} text-right`}>액션 횟수</th>
                      <th className={`${thC} text-right`}>ACD LOAD</th>
                      <th className={`${thC} text-right`}>최고 속도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedData.map((row, i) => {
                      const typed = hasType(row.player_id);
                      return (
                        <tr key={i} className="hover:bg-surface-secondary/20 transition-colors">
                          <td className={`${tdNameC} sticky left-0 bg-surface z-10 cursor-pointer`}
                            onClick={() => row.player_id && navigate(`/player/${row.player_id}`)}>
                            {row.player_name}
                          </td>
                          <td className={`${tdNameC} text-center`}>
                            <select value={playerTypes[row.player_id] || ''}
                              onChange={e => setType(row.player_id, e.target.value as TrainingType)}
                              className="text-[10px] px-1 py-0.5 rounded border border-surface-secondary bg-transparent outline-none w-16 text-center">
                              <option value="">-</option>
                              {TRAINING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          {typed ? (<>
                            <td className={tdC}>{fmtD(row.duration_min, 1)}</td>
                            <td className={tdC}>{fmtN(row.total_distance)}</td>
                            <td className={tdC}>{fmtD(row.m_per_min, 1)}</td>
                            <td className={tdC}>{fmtN(row.hsr_distance)}</td>
                            <td className={tdC}>{fmtN(row.hsr_custom)}</td>
                            <td className={tdC}>{fmtN(row.sprint_distance)}</td>
                            <td className={tdC}>{fmtN(row.sprint_custom)}</td>
                            <td className={tdC}>{fmtD(row.sprint_count, 1)}</td>
                            <td className={tdC}>{fmtD(row.sprint_count_custom, 1)}</td>
                            <td className={tdC}>{fmtD(row.acc_count, 1)}</td>
                            <td className={tdC}>{fmtD(row.dec_count, 1)}</td>
                            <td className={tdC}>{fmtD(row.acc_count + row.dec_count, 1)}</td>
                            <td className={tdC}>{fmtN(row.acd_load)}</td>
                            <td className={tdC}>{fmtD(row.max_speed, 1)}</td>
                          </>) : (
                            <>{Array.from({ length: 14 }, (_, j) => <td key={j} className={tdC}></td>)}</>
                          )}
                        </tr>
                      );
                    })}
                    {usedTypes.map(type => (
                      <AvgRow key={type} label={`팀 평균(${typeLabels[type]})`}
                        rows={rowsByType(type)} cls={{ name: avgNameC, td: avgTdC }} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 mb-5 stat-grid-4">
            <StatCard label="참여 선수" value={data.length} sub="명" accent={colors.navy} />
            <StatCard label="팀 평균 TD" value={Math.round(avgTd).toLocaleString()} sub="m" accent={colors.green} />
            <StatCard label="팀 평균 HSR" value={Math.round(avgHsr).toLocaleString()} sub="m" accent={colors.wine} />
            <StatCard label="평균 RPE" value={avgRpe ? avgRpe.toFixed(1) : '—'} sub="/ 10" accent={colors.warning} />
          </div>

          {grade3Rows.length > 0 && (
            <>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-sm font-semibold text-cyan-400">3학년 선수 차트</span>
                <span className="text-xs text-text-secondary">({grade3Rows.length}명)</span>
                {targets && (
                  <span className="text-[10px] text-text-disabled ml-2">
                    주기화 목표 — TD: {fmtN(tdTarget)} / HSR: {fmtN(hsrTarget)} / Sprint: {fmtN(sprintTarget)}
                  </span>
                )}
              </div>

              {/* Page 2: TD, ACD LOAD, Action */}
              <div ref={pdfChart1Ref} className="grid grid-cols-3 gap-4 mb-5">
                <OverlayChart title="TD(Plan vs Real)" data={mkChart(r => r.total_distance, tdTarget)}
                  color="rgba(21, 62, 111, 0.6)" unit=" m" targetLabel={tdTarget ? `${fmtN(tdTarget)}m` : undefined} />
                <OverlayChart title="ACD LOAD" data={mkChart(r => r.acd_load, 0)}
                  color="rgba(75, 0, 130, 0.5)" />
                <OverlayChart title="Total Action(ACC+DEC)" data={mkChart(r => r.acc_count + r.dec_count, 0)}
                  color="rgba(100, 100, 220, 0.6)" unit="회" />
              </div>

              {/* Page 3: HSR */}
              <div ref={pdfChart2Ref} className="grid grid-cols-2 gap-4 mb-5">
                <OverlayChart title="HSR(Plan vs Real)" data={mkChart(r => r.hsr_distance, hsrTarget)}
                  color="rgba(0, 140, 126, 0.6)" unit=" m" targetLabel={hsrTarget ? `${fmtN(hsrTarget)}m` : undefined} />
                <CompareChart title="HSR(Basic vs Custom)"
                  data={grade3Rows.map(d => ({ name: d.player_name, basic: Math.round(d.hsr_distance), custom: Math.round(d.hsr_custom) }))}
                  label1="Basic" label2="Custom" color1="rgba(0, 140, 126, 0.7)" color2="rgba(0, 200, 180, 0.4)" unit=" m" />
              </div>

              {/* Page 4: Sprint */}
              <div ref={pdfChart3Ref} className="grid grid-cols-2 gap-4 mb-5">
                <OverlayChart title="Sprint(Plan vs Real)" data={mkChart(r => r.sprint_distance, sprintTarget)}
                  color="rgba(164, 40, 67, 0.6)" unit=" m" targetLabel={sprintTarget ? `${fmtN(sprintTarget)}m` : undefined} />
                <CompareChart title="Sprint(Basic vs Custom)"
                  data={grade3Rows.map(d => ({ name: d.player_name, basic: Math.round(d.sprint_distance), custom: Math.round(d.sprint_custom) }))}
                  label1="Basic" label2="Custom" color1="rgba(164, 40, 67, 0.7)" color2="rgba(220, 100, 120, 0.4)" unit=" m" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
