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
        <text x={x + width / 2} y={y - 8} textAnchor="middle"
          fontSize={12} fontFamily="DM Mono" fill="#666">
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
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={sorted} margin={{ top: 30, right: 15, bottom: 30, left: 15 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={35} />
          <YAxis tick={{ fontSize: 12, fontFamily: 'DM Mono' }} domain={yDomain} width={60} />
          <Tooltip
            formatter={(v) => [`${Number(v).toLocaleString()}${unit}`, 'Real']}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 13 }}
          />
          {hasTarget && (
            <ReferenceLine y={sorted[0]?.target} stroke="#cc0000" strokeDasharray="5 3" strokeWidth={1.5} />
          )}
          <Bar dataKey="value" shape={DualBarShape(color)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CompareBarLabel(props: any) {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle"
      fontSize={11} fontFamily="DM Mono" fill="var(--color-text-secondary)">
      {Math.round(value).toLocaleString()}
    </text>
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
  const maxVal = Math.max(...sorted.map(d => Math.max(d.basic, d.custom)), 1);
  return (
    <div className="chart-card">
      <div className="chart-title text-center">{title}</div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={sorted} margin={{ top: 30, right: 15, bottom: 30, left: 15 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={35} />
          <YAxis tick={{ fontSize: 12, fontFamily: 'DM Mono' }} width={60} domain={[0, Math.ceil(maxVal * 1.2)]} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}${unit}`]}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 13 }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="basic" name={label1} fill={color1} barSize={18} radius={[2, 2, 0, 0]}
            label={<CompareBarLabel />} />
          <Bar dataKey="custom" name={label2} fill={color2} barSize={18} radius={[2, 2, 0, 0]}
            label={<CompareBarLabel />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DecBarWithLabel(props: any) {
  const { x, y, width, height, payload } = props;
  if (!width || !height) return null;
  const total = (payload?.acc || 0) + (payload?.dec || 0);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height}
        fill="rgba(255, 152, 0, 0.7)" rx={2} ry={2} />
      {total > 0 && (
        <text x={x + width / 2} y={y - 6} textAnchor="middle"
          fontSize={12} fontFamily="DM Mono" fontWeight="600" fill="#333">
          {total}
        </text>
      )}
    </g>
  );
}

function StackedActionChart({ title, data }: {
  title: string;
  data: { name: string; acc: number; dec: number }[];
}) {
  const sorted = [...data].sort((a, b) => (b.acc + b.dec) - (a.acc + a.dec));
  const maxVal = Math.max(...sorted.map(d => d.acc + d.dec), 1);

  return (
    <div className="chart-card">
      <div className="chart-title text-center">{title}</div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={sorted} margin={{ top: 30, right: 15, bottom: 30, left: 15 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={35} />
          <YAxis tick={{ fontSize: 12, fontFamily: 'DM Mono' }} width={60} domain={[0, Math.ceil(maxVal * 1.25)]} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}회`]}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 13 }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="acc" name="ACC" fill="rgba(33, 150, 243, 0.7)" stackId="action" barSize={28} />
          <Bar dataKey="dec" name="DEC" fill="rgba(255, 152, 0, 0.7)" stackId="action"
            barSize={28} shape={<DecBarWithLabel />} />
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

  const prepareForCapture = (el: HTMLElement) => {
    const rollback: (() => void)[] = [];
    const setStyle = (target: HTMLElement, props: Record<string, string>) => {
      const orig = target.style.cssText;
      rollback.push(() => { target.style.cssText = orig; });
      for (const [k, v] of Object.entries(props)) target.style.setProperty(k, v, 'important');
    };

    el.querySelectorAll<HTMLElement>('th').forEach(th => {
      setStyle(th, { background: '#4a4a60', color: '#ffffff', padding: '5px 8px', 'font-size': '10px', 'white-space': 'nowrap' });
    });
    el.querySelectorAll<HTMLElement>('thead, thead tr').forEach(t => {
      setStyle(t, { background: '#4a4a60' });
    });
    el.querySelectorAll<HTMLElement>('tbody tr').forEach(tr => {
      setStyle(tr, { background: '#ffffff', color: '#222222' });
      const select = tr.querySelector('select');
      if (select && !(select as HTMLSelectElement).value) {
        setStyle(tr, { display: 'none' });
      }
    });
    el.querySelectorAll<HTMLElement>('td').forEach(td => {
      setStyle(td, { background: '#ffffff', color: '#222222', padding: '4px 8px', 'font-size': '11px', 'white-space': 'nowrap', 'border-color': '#d0d0d0' });
    });
    el.querySelectorAll<HTMLElement>('.overflow-x-auto').forEach(o => {
      setStyle(o, { overflow: 'visible' });
    });
    el.querySelectorAll<HTMLElement>('.sticky').forEach(s => {
      setStyle(s, { position: 'static' });
    });
    el.querySelectorAll<HTMLElement>('select').forEach(s => {
      setStyle(s, { 'font-size': '10px', color: '#222', background: '#fff', border: '1px solid #bbb', '-webkit-appearance': 'none' });
    });
    el.querySelectorAll<HTMLElement>('.pdf-location-text').forEach(s => {
      setStyle(s, { display: 'inline', 'font-size': '12px', 'font-weight': '600', color: '#222' });
    });
    el.querySelectorAll<HTMLElement>('input[placeholder="장소 입력"]').forEach(inp => {
      setStyle(inp, { display: 'none' });
    });
    el.querySelectorAll<HTMLElement>('.chart-card').forEach(c => {
      setStyle(c, { background: '#ffffff', 'box-shadow': 'none', border: '1px solid #ccc' });
    });
    el.querySelectorAll<HTMLElement>('.chart-title').forEach(t => {
      setStyle(t, { color: '#222', 'font-size': '18px', 'font-weight': '700' });
    });
    el.querySelectorAll('svg text').forEach(t => {
      const origFill = t.getAttribute('fill');
      const origStyle = (t as HTMLElement).style.cssText;
      t.setAttribute('fill', '#333');
      (t as HTMLElement).style.setProperty('fill', '#333', 'important');
      rollback.push(() => {
        if (origFill) t.setAttribute('fill', origFill);
        (t as HTMLElement).style.cssText = origStyle;
      });
    });

    return () => rollback.forEach(fn => fn());
  };

  const handlePDF = useCallback(async () => {
    const CAPTURE_W = 1600;
    const PDF_RATIO = 2784 / 1608;
    const pdfW = 420;
    const pdfH = pdfW / PDF_RATIO;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pdfW, pdfH] });

    const refs = [pdfTableRef, pdfChart1Ref, pdfChart2Ref, pdfChart3Ref];

    for (let i = 0; i < refs.length; i++) {
      const el = refs[i].current;
      if (!el) continue;
      if (i > 0) pdf.addPage([pdfW, pdfH], 'landscape');

      const origCss = el.style.cssText;
      el.style.cssText = `width:${CAPTURE_W}px;min-width:${CAPTURE_W}px;max-width:${CAPTURE_W}px;overflow:visible;background:#fff;color:#222;padding:16px;`;

      const restore = prepareForCapture(el);

      await new Promise(r => setTimeout(r, 300));

      const canvas = await html2canvas(el, {
        scale: 1,
        backgroundColor: '#ffffff',
        useCORS: true,
        windowWidth: CAPTURE_W,
      });

      restore();
      el.style.cssText = origCss;

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const imgAspect = canvas.width / canvas.height;
      let dW = pdfW, dH = pdfW / imgAspect;
      if (dH > pdfH) { dH = pdfH; dW = pdfH * imgAspect; }
      pdf.addImage(imgData, 'JPEG', (pdfW - dW) / 2, (pdfH - dH) / 2, dW, dH);
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
          {/* 테이블 */}
          {sortedData.length > 0 && (
            <div ref={pdfTableRef} className="chart-card mb-5">
              <div className="text-center mb-3">
                <div className="chart-title mb-1">- 선수별 데이터 -</div>
                <div className="flex items-center justify-center gap-6 flex-wrap">
                  <span className="text-xs text-text-secondary">일시: {formatKoreanDate(selectedDate)}</span>
                  <span className="text-xs text-text-secondary">
                    장소: <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="장소 입력" className="px-2 py-0.5 text-xs rounded border border-surface-secondary bg-transparent w-36 outline-none" />
                    <span className="pdf-location-text" style={{ display: 'none' }}>{location || '-'}</span>
                  </span>
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

              {/* Page 2: TD, Total Action, ACD LOAD (세로 3단) */}
              <div ref={pdfChart1Ref} className="space-y-4 mb-5">
                <OverlayChart title="TD(Plan vs Real)" data={mkChart(r => r.total_distance, tdTarget)}
                  color="rgba(139, 195, 74, 0.7)" unit=" m" targetLabel={tdTarget ? `${fmtN(tdTarget)}m` : undefined} />
                <StackedActionChart title="Total Action(ACC+DEC)"
                  data={grade3Rows.map(d => ({ name: d.player_name, acc: Math.round(d.acc_count), dec: Math.round(d.dec_count) }))} />
                <OverlayChart title="ACD LOAD" data={mkChart(r => r.acd_load, 0)}
                  color="rgba(140, 20, 20, 0.7)" />
              </div>

              {/* Page 3: HSR (세로 2단) */}
              <div ref={pdfChart2Ref} className="space-y-4 mb-5">
                <OverlayChart title="HSR(Plan vs Real)" data={mkChart(r => r.hsr_distance, hsrTarget)}
                  color="rgba(0, 140, 126, 0.6)" unit=" m" targetLabel={hsrTarget ? `${fmtN(hsrTarget)}m` : undefined} />
                <CompareChart title="HSR(Basic vs Custom)"
                  data={grade3Rows.map(d => ({ name: d.player_name, basic: Math.round(d.hsr_distance), custom: Math.round(d.hsr_custom) }))}
                  label1="Basic" label2="Custom" color1="rgba(0, 140, 126, 0.7)" color2="rgba(0, 200, 180, 0.4)" unit=" m" />
              </div>

              {/* Page 4: Sprint (세로 2단) */}
              <div ref={pdfChart3Ref} className="space-y-4 mb-5">
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
