import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { fetchMatchDates, fetchMatchReportData, saveMatchPositions } from '../lib/api';
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

function SimpleChart({ title, data, color, unit = '' }: {
  title: string;
  data: { name: string; value: number }[];
  color: string;
  unit?: string;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const maxVal = Math.max(...sorted.map(d => d.value), 1);
  return (
    <div className="chart-card">
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

function PosAvgRow({ label, rows, cls }: { label: string; rows: MatchReportRow[]; cls: { name: string; td: string } }) {
  if (!rows.length) return null;
  return (
    <tr className="bg-surface-secondary/20">
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
    const rows = await fetchMatchReportData(date, opponent);
    setData(rows);
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

  const pdfTableRef = useRef<HTMLDivElement>(null);
  const pdfChart1Ref = useRef<HTMLDivElement>(null);
  const pdfChart2Ref = useRef<HTMLDivElement>(null);

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
    el.querySelectorAll<HTMLElement>('.overflow-x-auto').forEach(o => {
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
    // position avg rows background
    el.querySelectorAll<HTMLElement>('tr.pos-avg-row').forEach(tr => {
      setStyle(tr, { background: '#f0f0f0', color: '#222' });
      tr.querySelectorAll<HTMLElement>('td').forEach(td => {
        setStyle(td, { background: '#f0f0f0', color: '#222' });
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

    const refs = [pdfTableRef, pdfChart1Ref, pdfChart2Ref];

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
                    {/* 팀 평균(풀타임) */}
                    {assignedRows.length > 0 && (
                      <PosAvgRow label="팀 평균(풀타임)" rows={assignedRows}
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
              <div ref={pdfChart1Ref} className="space-y-4 mb-5">
                <SimpleChart title="TD (Total Distance)" data={mkChart(r => r.total_distance)}
                  color="rgba(139, 195, 74, 0.7)" unit=" m" />
                <SimpleChart title="HSR (High Speed Running)" data={mkChart(r => r.hsr_distance)}
                  color="rgba(0, 140, 126, 0.6)" unit=" m" />
              </div>

              <div ref={pdfChart2Ref} className="space-y-4 mb-5">
                <StackedActionChart title="Total Action (ACC + DEC)"
                  data={assignedRows.map(d => ({ name: d.player_name, acc: Math.round(d.acc_count), dec: Math.round(d.dec_count) }))} />
                <SimpleChart title="ACD LOAD" data={mkChart(r => r.acd_load)}
                  color="rgba(140, 20, 20, 0.7)" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
