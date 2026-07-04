import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { fetchMatchDates, fetchMatchReportData, saveMatchPositions, fetchMatchSessionData, type MatchSessionRow } from '../lib/api';
import type { MatchReportRow } from '../types';

const POSITIONS = ['GK', 'CB', 'FB', 'MF', 'WF', 'CF'] as const;
type Position = typeof POSITIONS[number];

function fmtN(v: number): string { return v ? Math.round(v).toLocaleString() : '0'; }
function fmtD(v: number, d = 1): string { return v ? Number(v).toFixed(d) : '0'; }

function formatKoreanDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}(${days[d.getDay()]})`;
}

function avgOf(rows: MatchReportRow[], fn: (r: MatchReportRow) => number): number {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + fn(r), 0) / rows.length;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LabeledBarShape(color: string) {
  return (props: any) => {
    const { x, y, width, height, value } = props;
    if (!width) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height || 0} fill={color} rx={2} ry={2} />
        {value > 0 && (
          <text x={x + width / 2} y={y - 6} textAnchor="middle"
            fontSize={11} fontFamily="DM Mono" fill="#666">
            {Math.round(value).toLocaleString()}
          </text>
        )}
      </g>
    );
  };
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

function SimpleChart({ title, data, color, unit = '', noSort }: {
  title: string;
  data: { name: string; value: number }[];
  color: string;
  unit?: string;
  noSort?: boolean;
}) {
  const sorted = noSort ? data : [...data].sort((a, b) => b.value - a.value);
  const maxVal = Math.max(...sorted.map(d => d.value), 1);
  return (
    <div className="chart-card min-w-0">
      <div className="chart-title text-center">{title}</div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={sorted} margin={{ top: 30, right: 15, bottom: 30, left: 15 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={35} />
          <YAxis tick={{ fontSize: 12, fontFamily: 'DM Mono' }} domain={[0, Math.ceil(maxVal * 1.15)]} width={60} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}${unit}`]}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 13 }} />
          <Bar dataKey="value" fill={color} shape={LabeledBarShape(color)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TdMminBarShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!width) return null;
  const td = payload?.td ?? 0;
  const mmin = payload?.mmin ?? 0;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height || 0} fill="rgba(139, 195, 74, 0.7)" rx={2} ry={2} />
      {td > 0 && (
        <text x={x + width / 2} y={y - 18} textAnchor="middle"
          fontSize={11} fontFamily="DM Mono" fill="#666">
          {Math.round(td).toLocaleString()}
        </text>
      )}
      {mmin > 0 && (
        <text x={x + width / 2} y={y - 5} textAnchor="middle"
          fontSize={10} fontFamily="DM Mono" fontWeight="600" fill="#c62828">
          {mmin.toFixed(1)}
        </text>
      )}
    </g>
  );
}

function TdComboChart({ title, data, noSort }: {
  title: string;
  data: { name: string; td: number; mmin: number }[];
  noSort?: boolean;
}) {
  const sorted = noSort ? data : [...data].sort((a, b) => b.td - a.td);
  const maxTd = Math.max(...sorted.map(d => d.td), 1);
  return (
    <div className="chart-card min-w-0">
      <div className="chart-title text-center">{title}</div>
      <div className="flex items-center justify-center gap-4 mb-2">
        <span className="flex items-center gap-1 text-[10px]">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(139,195,74,0.7)' }} /> TD
        </span>
        <span className="flex items-center gap-1 text-[10px]">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#c62828' }} /> M/min
        </span>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={sorted} margin={{ top: 35, right: 15, bottom: 30, left: 15 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={35} />
          <YAxis tick={{ fontSize: 12, fontFamily: 'DM Mono' }} domain={[0, Math.ceil(maxTd * 1.15)]} width={60} />
          <Tooltip formatter={(v, name) => [`${Number(v).toLocaleString()}${name === 'td' ? ' m' : ' m/min'}`, name === 'td' ? 'TD' : 'M/min']}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 13 }} />
          <Bar dataKey="td" shape={<TdMminBarShape />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HsrSprintTopShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!width) return null;
  const total = (payload?.hsr || 0) + (payload?.sprint || 0);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height || 0} fill="rgba(164, 40, 67, 0.6)" rx={0} ry={0} />
      {total > 0 && (
        <text x={x + width / 2} y={y - 6} textAnchor="middle"
          fontSize={11} fontFamily="DM Mono" fontWeight="600" fill="#333">
          {Math.round(total).toLocaleString()}
        </text>
      )}
    </g>
  );
}

function StackedHsrSprintChart({ title, data, noSort }: {
  title: string;
  data: { name: string; hsr: number; sprint: number }[];
  noSort?: boolean;
}) {
  const sorted = noSort ? data : [...data].sort((a, b) => (b.hsr + b.sprint) - (a.hsr + a.sprint));
  const maxVal = Math.max(...sorted.map(d => d.hsr + d.sprint), 1);
  return (
    <div className="chart-card min-w-0">
      <div className="chart-title text-center">{title}</div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={sorted} margin={{ top: 30, right: 15, bottom: 30, left: 15 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={35} />
          <YAxis tick={{ fontSize: 12, fontFamily: 'DM Mono' }} width={60} domain={[0, Math.ceil(maxVal * 1.2)]} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} m`]}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 13 }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="hsr" name="HSR" fill="rgba(0, 140, 126, 0.6)" stackId="hs" barSize={28} />
          <Bar dataKey="sprint" name="Sprint" fill="rgba(164, 40, 67, 0.6)" stackId="hs"
            barSize={28} shape={<HsrSprintTopShape />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StackedActionChart({ title, data, noSort }: {
  title: string;
  data: { name: string; acc: number; dec: number }[];
  noSort?: boolean;
}) {
  const sorted = noSort ? data : [...data].sort((a, b) => (b.acc + b.dec) - (a.acc + a.dec));
  const maxVal = Math.max(...sorted.map(d => d.acc + d.dec), 1);
  return (
    <div className="chart-card min-w-0">
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

function PosAvgRow({ label, rows, cls }: { label: string; rows: MatchReportRow[]; cls: { name: string; td: string } }) {
  if (!rows.length) return null;
  return (
    <tr className="bg-surface-secondary/30 pos-avg-row">
      <td className={`${cls.name} sticky left-0 bg-surface-secondary/20 z-10`}>{label}</td>
      <td className={cls.name}></td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.play_time_min), 0)}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.total_distance))}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.m_per_min), 1)}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.hsr_distance))}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.sprint_distance))}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.sprint_count), 1)}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.acc_count), 1)}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.dec_count), 1)}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.acc_count + r.dec_count), 1)}</td>
      <td className={cls.td}>{fmtN(avgOf(rows, r => r.acd_load))}</td>
      <td className={cls.td}>{fmtD(avgOf(rows, r => r.max_speed), 1)}</td>
    </tr>
  );
}

export function MatchReport() {
  const [matches, setMatches] = useState<{ date: string; opponent: string; event_type: string }[]>([]);
  const [selectedMatch, setSelectedMatch] = useState('');
  const [data, setData] = useState<MatchReportRow[]>([]);
  const [sessionData, setSessionData] = useState<MatchSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchMatchDates().then(m => {
      setMatches(m);
      if (m.length > 0) {
        const key = `${m[0].date}_${m[0].opponent}`;
        setSelectedMatch(key);
        loadMatch(m[0].date, m[0].opponent);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const loadMatch = async (date: string, opponent: string) => {
    setLoading(true);
    const [rows, sessions] = await Promise.all([
      fetchMatchReportData(date, opponent),
      fetchMatchSessionData(date, opponent).catch(() => []),
    ]);
    setData(rows);
    setSessionData(sessions);
    const posMap: Record<string, Position> = {};
    rows.forEach(r => {
      if (r.position_played && POSITIONS.includes(r.position_played as Position)) {
        posMap[r.id] = r.position_played as Position;
      }
    });
    setPositions(posMap);
    setLoading(false);
  };

  const handleMatchChange = (key: string) => {
    setSelectedMatch(key);
    const [date, opponent] = key.split('_');
    loadMatch(date, opponent);
  };

  const setPos = (id: string, pos: Position) => {
    setPositions(prev => {
      const next = { ...prev, [id]: pos };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveMatchPositions(data.map(r => r.id), next).catch(() => {});
      }, 500);
      return next;
    });
  };

  const sortedData = useMemo(() =>
    [...data].sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)),
  [data]);

  const assignedRows = useMemo(() =>
    sortedData.filter(r => !!positions[r.id]),
  [sortedData, positions]);

  const maxPlayTime = useMemo(() =>
    Math.max(...assignedRows.map(r => r.play_time_min), 0),
  [assignedRows]);

  const posAvgMinTime = maxPlayTime >= 80 ? 60 : maxPlayTime >= 70 ? 50 : 0;

  const fullTimeRows = useMemo(() =>
    assignedRows.filter(r => r.play_time_min >= maxPlayTime - 1 && positions[r.id] !== 'GK'),
  [assignedRows, maxPlayTime, positions]);

  const positionOrder: Position[] = ['GK', 'CB', 'FB', 'MF', 'WF', 'CF'];
  const groupedRows = useMemo(() => {
    const groups: { pos: Position; rows: MatchReportRow[]; avgRows: MatchReportRow[] }[] = [];
    for (const pos of positionOrder) {
      const rows = assignedRows.filter(r => positions[r.id] === pos);
      const avgRows = rows.filter(r => r.play_time_min >= posAvgMinTime);
      if (rows.length) groups.push({ pos, rows, avgRows });
    }
    return groups;
  }, [assignedRows, positions, posAvgMinTime]);

  const selectedMatchInfo = matches.find(m => `${m.date}_${m.opponent}` === selectedMatch);

  const thC = 'px-2 py-2 text-[11px] font-semibold whitespace-nowrap border-b border-surface-secondary';
  const tdC = 'px-2 py-1.5 text-[11px] whitespace-nowrap border-b border-surface-secondary text-right';
  const tdNameC = 'px-2 py-1.5 text-[11px] font-medium whitespace-nowrap border-b border-surface-secondary';
  const avgTdC = 'px-2 py-2 text-[11px] font-bold whitespace-nowrap border-t-2 border-surface-secondary text-right';
  const avgNameC = 'px-2 py-2 text-[11px] font-bold whitespace-nowrap border-t-2 border-surface-secondary';

  const posLabels: Record<Position, string> = {
    GK: 'GK평균', CB: 'CB평균', FB: 'FB평균', MF: 'MF평균', WF: 'WF평균', CF: 'CF평균',
  };

  const posChartData = useMemo(() => {
    const display: Position[] = ['CB', 'FB', 'MF', 'WF', 'CF'];
    return display.map(pos => {
      const rows = assignedRows.filter(r => positions[r.id] === pos && r.play_time_min >= posAvgMinTime);
      if (!rows.length) return null;
      return {
        name: pos,
        td: Math.round(avgOf(rows, r => r.total_distance)),
        mmin: Number(avgOf(rows, r => r.m_per_min).toFixed(1)),
        hsr: Math.round(avgOf(rows, r => r.hsr_distance)),
        sprint: Math.round(avgOf(rows, r => r.sprint_distance)),
        acc: Math.round(avgOf(rows, r => r.acc_count)),
        dec: Math.round(avgOf(rows, r => r.dec_count)),
        action: Math.round(avgOf(rows, r => r.acc_count + r.dec_count)),
        acd: Math.round(avgOf(rows, r => r.acd_load)),
      };
    }).filter(Boolean) as { name: string; td: number; mmin: number; hsr: number; sprint: number; acc: number; dec: number; action: number; acd: number }[];
  }, [assignedRows, positions, posAvgMinTime]);

  const sessionCompareData = useMemo(() => {
    if (!sessionData.length) return null;
    const rawSessions = [...new Set(sessionData.map(s => s.session_name))];
    const sessions = rawSessions.sort((a, b) => {
      if (a === '전반') return -1;
      if (b === '전반') return 1;
      return a.localeCompare(b);
    });
    if (sessions.length < 2) return null;

    const maxSessionTime = Math.max(...data.map(r => r.play_time_min), 0);
    const ftPlayerIds = new Set(
      data.filter(r => r.play_time_min >= maxSessionTime - 1).map(r => r.player_id)
    );

    return sessions.map(sn => {
      const rows = ftPlayerIds.size > 0
        ? sessionData.filter(r => r.session_name === sn && ftPlayerIds.has(r.player_id))
        : sessionData.filter(r => r.session_name === sn);
      if (!rows.length) return null;
      const avg = (fn: (r: MatchSessionRow) => number) => rows.reduce((s, r) => s + fn(r), 0) / rows.length;
      return {
        name: sn,
        td: Math.round(avg(r => r.total_distance)),
        mmin: Number(avg(r => r.m_per_min).toFixed(1)),
        hsr: Math.round(avg(r => r.hsr_distance)),
        sprint: Math.round(avg(r => r.sprint_distance)),
        acc: Math.round(avg(r => r.acc_count)),
        dec: Math.round(avg(r => r.dec_count)),
        acd: Math.round(avg(r => r.acd_load)),
      };
    }).filter(Boolean) as { name: string; td: number; mmin: number; hsr: number; sprint: number; acc: number; dec: number; acd: number }[];
  }, [sessionData, data]);

  const pdfTableRef = useRef<HTMLDivElement>(null);
  const pdfChart1Ref = useRef<HTMLDivElement>(null);
  const pdfChart2Ref = useRef<HTMLDivElement>(null);
  const pdfChart3Ref = useRef<HTMLDivElement>(null);
  const pdfChart4Ref = useRef<HTMLDivElement>(null);

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
    });
    el.querySelectorAll<HTMLElement>('td').forEach(td => {
      setStyle(td, { background: '#ffffff', color: '#222222', padding: '4px 8px', 'font-size': '11px', 'white-space': 'nowrap', 'border-color': '#d0d0d0' });
    });
    el.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-hidden').forEach(o => {
      setStyle(o, { overflow: 'visible' });
    });
    el.querySelectorAll<HTMLElement>('table').forEach(t => {
      setStyle(t, { width: '100%', 'table-layout': 'fixed' });
    });
    el.querySelectorAll<HTMLElement>('.sticky').forEach(s => {
      setStyle(s, { position: 'static' });
    });
    el.querySelectorAll<HTMLSelectElement>('select').forEach(s => {
      const val = s.value || '-';
      const span = document.createElement('span');
      span.textContent = val;
      span.style.cssText = 'font-size:10px;color:#222;font-weight:500;';
      s.parentNode?.insertBefore(span, s);
      setStyle(s, { display: 'none' });
      rollback.push(() => { span.remove(); });
    });
    el.querySelectorAll<HTMLElement>('.chart-title').forEach(t => {
      setStyle(t, { color: '#222', 'font-size': '18px', 'font-weight': '700', 'text-align': 'center', 'margin-bottom': '4px' });
    });
    el.querySelectorAll<HTMLElement>('.pdf-header-info').forEach(h => {
      setStyle(h, { 'font-size': '13px', color: '#222', 'text-align': 'center', 'margin-bottom': '8px' });
    });
    el.querySelectorAll<HTMLElement>('.chart-card').forEach(c => {
      setStyle(c, { background: '#ffffff', 'box-shadow': 'none', border: 'none', padding: '0', 'margin-bottom': '4px' });
    });
    el.querySelectorAll<HTMLElement>('.flex.flex-wrap').forEach(g => {
      setStyle(g, { display: 'flex', 'flex-wrap': 'wrap', margin: '0', width: '100%' });
    });
    el.querySelectorAll<HTMLElement>('.w-1\\/2').forEach(c => {
      setStyle(c, { width: '50%', 'box-sizing': 'border-box', padding: '0 4px' });
    });
    el.querySelectorAll<HTMLElement>('.recharts-responsive-container').forEach(c => {
      setStyle(c, { width: '100%', 'min-width': '0' });
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
    el.querySelectorAll<HTMLElement>('tr.pos-avg-row').forEach(tr => {
      setStyle(tr, { background: '#e8e8f0', color: '#222' });
      tr.querySelectorAll<HTMLElement>('td').forEach(td => {
        setStyle(td, { background: '#e8e8f0', color: '#222', 'font-weight': '700', 'border-top': '2px solid #999' });
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

    const refs = [pdfTableRef, pdfChart1Ref, pdfChart2Ref, pdfChart3Ref, pdfChart4Ref];

    for (let i = 0; i < refs.length; i++) {
      const el = refs[i].current;
      if (!el) continue;
      if (i > 0) pdf.addPage([pdfW, pdfH], 'landscape');

      const origCss = el.style.cssText;
      el.style.cssText = `width:${CAPTURE_W}px;min-width:${CAPTURE_W}px;max-width:${CAPTURE_W}px;overflow:visible;background:#fff;color:#222;padding:4px;`;

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

    const [date] = selectedMatch.split('_');
    pdf.save(`매치리포트_${date}_${selectedMatchInfo?.opponent ?? ''}.pdf`);
  }, [selectedMatch, selectedMatchInfo]);

  const mkChart = (fn: (r: MatchReportRow) => number) =>
    assignedRows.map(d => ({ name: d.player_name, value: Math.round(fn(d)) }));

  const tdComboData = assignedRows.map(d => ({
    name: d.player_name, td: Math.round(d.total_distance), mmin: d.m_per_min,
  }));

  const hsrSprintData = assignedRows.map(d => ({
    name: d.player_name, hsr: Math.round(d.hsr_distance), sprint: Math.round(d.sprint_distance),
  }));

  return (
    <div className="p-6">
      <div className="sec-title">매치 리포트</div>

      <div className="flex items-center gap-3 mb-5">
        <label className="text-[10px] tracking-[1px] uppercase text-text-disabled" style={{ fontFamily: 'var(--font-data)' }}>
          경기 선택
        </label>
        <select value={selectedMatch} onChange={e => handleMatchChange(e.target.value)}
          className="px-3 py-1.5 border border-surface-secondary rounded-[var(--radius-sm)] text-sm bg-white outline-none focus:border-purple"
          style={{ fontFamily: 'var(--font-data)' }}>
          {matches.map(m => {
            const key = `${m.date}_${m.opponent}`;
            return <option key={key} value={key}>{m.date} vs {m.opponent} ({m.event_type})</option>;
          })}
        </select>
        {assignedRows.length > 0 && (
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
          {sortedData.length > 0 && (
            <div ref={pdfTableRef} className="chart-card mb-5">
              <div className="text-center mb-3">
                <div className="chart-title mb-1">DAEJEON HANA CITIZEN U15 Match DATA</div>
                <div className="pdf-header-info flex items-center justify-center gap-8 flex-wrap" style={{ fontSize: 13 }}>
                  <span>일시: {selectedMatchInfo ? formatKoreanDate(selectedMatchInfo.date) : ''}</span>
                  <span>대회: {selectedMatchInfo?.event_type ?? ''}</span>
                  <span>상대: {selectedMatchInfo?.opponent ?? ''}</span>
                  <span>인원: {assignedRows.length}명</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-data)' }}>
                  <thead>
                    <tr className="bg-surface-secondary/40">
                      <th className={`${thC} text-left sticky left-0 bg-surface z-10`}>선수명</th>
                      <th className={`${thC} text-center`} style={{ minWidth: 50 }}>포지션</th>
                      <th className={`${thC} text-right`}>시간</th>
                      <th className={`${thC} text-right`}>TD</th>
                      <th className={`${thC} text-right`}>M/min</th>
                      <th className={`${thC} text-right`}>HSR</th>
                      <th className={`${thC} text-right`}>SPRINT</th>
                      <th className={`${thC} text-right`}>SPRINT(n)</th>
                      <th className={`${thC} text-right`}>ACC</th>
                      <th className={`${thC} text-right`}>DEC</th>
                      <th className={`${thC} text-right`}>ACTION</th>
                      <th className={`${thC} text-right`}>ACD LOAD</th>
                      <th className={`${thC} text-right`}>SPEED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows.map(({ pos, rows, avgRows }) => (
                      <>
                        {rows.map((row) => (
                          <tr key={row.id} className="hover:bg-surface-secondary/20 transition-colors">
                            <td className={`${tdNameC} sticky left-0 bg-surface z-10`}>{row.player_name}</td>
                            <td className={`${tdNameC} text-center`}>
                              <select value={positions[row.id] || ''}
                                onChange={e => setPos(row.id, e.target.value as Position)}
                                className="text-[10px] px-1 py-0.5 rounded border border-surface-secondary bg-transparent outline-none w-14 text-center">
                                <option value="">-</option>
                                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </td>
                            <td className={tdC}>{fmtD(row.play_time_min, 0)}</td>
                            <td className={tdC}>{fmtN(row.total_distance)}</td>
                            <td className={tdC}>{fmtD(row.m_per_min, 1)}</td>
                            <td className={tdC}>{fmtN(row.hsr_distance)}</td>
                            <td className={tdC}>{fmtN(row.sprint_distance)}</td>
                            <td className={tdC}>{fmtD(row.sprint_count, 1)}</td>
                            <td className={tdC}>{fmtD(row.acc_count, 1)}</td>
                            <td className={tdC}>{fmtD(row.dec_count, 1)}</td>
                            <td className={tdC}>{fmtD(row.acc_count + row.dec_count, 1)}</td>
                            <td className={tdC}>{fmtN(row.acd_load)}</td>
                            <td className={tdC}>{fmtD(row.max_speed, 1)}</td>
                          </tr>
                        ))}
                        <PosAvgRow label={posLabels[pos]} rows={avgRows}
                          cls={{ name: avgNameC, td: avgTdC }} />
                      </>
                    ))}
                    {/* 팀 평균(풀타임, GK 제외) */}
                    {fullTimeRows.length > 0 && (
                      <PosAvgRow label="팀 평균(풀타임, GK 제외)" rows={fullTimeRows}
                        cls={{ name: avgNameC, td: avgTdC }} />
                    )}
                    {/* unassigned rows */}
                    {sortedData.filter(r => !positions[r.id]).map(row => (
                      <tr key={row.id} className="hover:bg-surface-secondary/20 transition-colors">
                        <td className={`${tdNameC} sticky left-0 bg-surface z-10`}>{row.player_name}</td>
                        <td className={`${tdNameC} text-center`}>
                          <select value=""
                            onChange={e => setPos(row.id, e.target.value as Position)}
                            className="text-[10px] px-1 py-0.5 rounded border border-surface-secondary bg-transparent outline-none w-14 text-center">
                            <option value="">-</option>
                            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        {Array.from({ length: 11 }, (_, j) => <td key={j} className={tdC}></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {assignedRows.length > 0 && (
            <>
              <div className="mb-3">
                <span className="text-sm font-semibold">선수별 데이터</span>
              </div>
              <div ref={pdfChart1Ref} className="space-y-4 mb-5">
                <TdComboChart title="총 뛴 거리 / 분당 뛴 거리" data={tdComboData} />
                <StackedHsrSprintChart title="고강도 이동거리 (Sprint/HSR)"
                  data={hsrSprintData} />
              </div>

              <div ref={pdfChart2Ref} className="space-y-4 mb-5">
                <StackedActionChart title="액션 (ACC/DEC)"
                  data={assignedRows.map(d => ({ name: d.player_name, acc: Math.round(d.acc_count), dec: Math.round(d.dec_count) }))} />
                <SimpleChart title="ACD LOAD (Intensity)" data={mkChart(r => r.acd_load)}
                  color="rgba(140, 20, 20, 0.7)" />
              </div>

              {posChartData.length > 0 && (
                <>
                  <div className="mb-3">
                    <span className="text-sm font-semibold">포지션별 데이터</span>
                  </div>
                  <div ref={pdfChart3Ref} className="mb-5">
                    <div className="flex flex-wrap" style={{ margin: '0 -8px' }}>
                      <div className="w-1/2 px-2 mb-4 min-w-0">
                        <SimpleChart title="총 뛴 거리 (TD)" data={posChartData.map(d => ({ name: d.name, value: d.td }))}
                          color="rgba(21, 62, 111, 0.8)" unit=" m" />
                      </div>
                      <div className="w-1/2 px-2 mb-4 min-w-0">
                        <StackedHsrSprintChart title="고강도 이동거리 (Sprint/HSR)"
                          data={posChartData.map(d => ({ name: d.name, hsr: d.hsr, sprint: d.sprint }))} />
                      </div>
                      <div className="w-1/2 px-2 mb-4 min-w-0">
                        <StackedActionChart title="액션 (ACC/DEC)"
                          data={posChartData.map(d => ({ name: d.name, acc: d.acc, dec: d.dec }))} />
                      </div>
                      <div className="w-1/2 px-2 mb-4 min-w-0">
                        <SimpleChart title="ACD LOAD (Intensity)" data={posChartData.map(d => ({ name: d.name, value: d.acd }))}
                          color="rgba(140, 20, 20, 0.7)" />
                      </div>
                    </div>
                  </div>
                </>
              )}

            </>
          )}

          {sessionCompareData && sessionCompareData.length >= 2 && (
            <>
              <div className="mb-3">
                <span className="text-sm font-semibold">전/후반 비교 데이터</span>
              </div>
              <div ref={pdfChart4Ref} className="mb-5">
                <div className="flex flex-wrap" style={{ margin: '0 -8px' }}>
                  <div className="w-1/2 px-2 mb-4 min-w-0">
                    <TdComboChart title="총 뛴 거리 / 분당 뛴 거리" data={sessionCompareData.map(d => ({ name: d.name, td: d.td, mmin: d.mmin }))} noSort />
                  </div>
                  <div className="w-1/2 px-2 mb-4 min-w-0">
                    <StackedHsrSprintChart title="고강도 이동거리 (Sprint/HSR)"
                      data={sessionCompareData.map(d => ({ name: d.name, hsr: d.hsr, sprint: d.sprint }))} noSort />
                  </div>
                  <div className="w-1/2 px-2 mb-4 min-w-0">
                    <StackedActionChart title="액션 (ACC/DEC)"
                      data={sessionCompareData.map(d => ({ name: d.name, acc: d.acc, dec: d.dec }))} noSort />
                  </div>
                  <div className="w-1/2 px-2 mb-4 min-w-0">
                    <SimpleChart title="ACD LOAD (Intensity)" data={sessionCompareData.map(d => ({ name: d.name, value: d.acd }))}
                      color="rgba(140, 20, 20, 0.7)" noSort />
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
