import { useState, useEffect, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  fetchWeeklyPeriodization,
  upsertWeeklyPeriodization,
  fetchSavedWeeks,
  emptyDayPlan,
  type DayPlan,
} from '../lib/api';

function AutoCell({
  value, onChange, onBlur, className,
}: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = '0'; el.style.height = el.scrollHeight + 'px'; }
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
      onBlur={onBlur} rows={1} className={className} />
  );
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const ROW_LABELS = [
  'Periodization', 'Physical Goal',
  'Time', 'Intensity', 'Training Load',
  'Total Distance', 'HSR Distance', 'Sprint Distance',
  'ACC / DEC',
];
const ROW_KEYS: (keyof DayPlan)[] = [
  'periodization', 'physical_goal',
  'time', 'intensity', 'training_load',
  'total_distance', 'hsr_distance', 'sprint_distance',
  'acc_dec',
];
const NUMERIC_ROWS = ['time', 'training_load', 'total_distance', 'hsr_distance', 'sprint_distance'];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function parseRange(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^0-9.~\-±]/g, '');
  if (cleaned.includes('~')) {
    const parts = cleaned.split('~').map(Number).filter(n => !isNaN(n));
    return parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0] || 0;
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

type DragEdge = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
const MIN_SIZE = 4;
const PW = 68, PH = 105;

function PitchDiagram({
  rect, onChange,
}: {
  rect: { x: number; y: number; w: number; h: number };
  onChange: (r: { x: number; y: number; w: number; h: number }) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<DragEdge | null>(null);
  const startRef = useRef({ mx: 0, my: 0, rx: 0, ry: 0, rw: 0, rh: 0 });

  const toSvg = (e: React.MouseEvent | MouseEvent) => {
    const svg = svgRef.current!;
    const b = svg.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * PW, y: ((e.clientY - b.top) / b.height) * PH };
  };

  const onDown = (e: React.MouseEvent, edge: DragEdge) => {
    e.preventDefault(); e.stopPropagation();
    const p = toSvg(e);
    startRef.current = { mx: p.x, my: p.y, rx: rect.x, ry: rect.y, rw: rect.w, rh: rect.h };
    setDragging(edge);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const p = toSvg(e);
      const dx = p.x - startRef.current.mx, dy = p.y - startRef.current.my;
      const s = startRef.current;
      let { x, y, w, h } = { x: s.rx, y: s.ry, w: s.rw, h: s.rh };
      if (dragging === 'move') {
        x = Math.max(0, Math.min(PW - w, s.rx + dx));
        y = Math.max(0, Math.min(PH - h, s.ry + dy));
      } else {
        if (dragging.includes('n')) { y = Math.max(0, s.ry + dy); h = Math.max(MIN_SIZE, s.rh - (y - s.ry)); }
        if (dragging.includes('s')) { h = Math.max(MIN_SIZE, Math.min(PH - y, s.rh + dy)); }
        if (dragging.includes('w')) { x = Math.max(0, s.rx + dx); w = Math.max(MIN_SIZE, s.rw - (x - s.rx)); }
        if (dragging.includes('e')) { w = Math.max(MIN_SIZE, Math.min(PW - x, s.rw + dx)); }
      }
      onChange({ x, y, w, h });
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, onChange, rect]);

  const eb = 2, cs = 3;
  return (
    <svg ref={svgRef} viewBox="0 0 68 105" className="w-full h-full cursor-default select-none">
      <rect x="0" y="0" width="68" height="105" fill="#4a8c3f" rx="1" />
      <rect x="2" y="2" width="64" height="101" fill="none" stroke="white" strokeWidth="0.4" />
      <line x1="2" y1="52.5" x2="66" y2="52.5" stroke="white" strokeWidth="0.3" />
      <circle cx="34" cy="52.5" r="9" fill="none" stroke="white" strokeWidth="0.3" />
      <circle cx="34" cy="52.5" r="0.8" fill="white" />
      <rect x="14" y="2" width="40" height="16" fill="none" stroke="white" strokeWidth="0.3" />
      <rect x="14" y="87" width="40" height="16" fill="none" stroke="white" strokeWidth="0.3" />
      <rect x="22" y="2" width="24" height="7" fill="none" stroke="white" strokeWidth="0.3" />
      <rect x="22" y="96" width="24" height="7" fill="none" stroke="white" strokeWidth="0.3" />
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h}
        fill="rgba(255,0,0,0.18)" stroke="red" strokeWidth="0.6"
        className="cursor-move" onMouseDown={e => onDown(e, 'move')} />
      <rect x={rect.x + cs} y={rect.y - eb} width={rect.w - cs * 2} height={eb * 2}
        fill="transparent" className="cursor-n-resize" onMouseDown={e => onDown(e, 'n')} />
      <rect x={rect.x + cs} y={rect.y + rect.h - eb} width={rect.w - cs * 2} height={eb * 2}
        fill="transparent" className="cursor-s-resize" onMouseDown={e => onDown(e, 's')} />
      <rect x={rect.x - eb} y={rect.y + cs} width={eb * 2} height={rect.h - cs * 2}
        fill="transparent" className="cursor-w-resize" onMouseDown={e => onDown(e, 'w')} />
      <rect x={rect.x + rect.w - eb} y={rect.y + cs} width={eb * 2} height={rect.h - cs * 2}
        fill="transparent" className="cursor-e-resize" onMouseDown={e => onDown(e, 'e')} />
      {([
        { edge: 'nw' as DragEdge, cx: rect.x, cy: rect.y },
        { edge: 'ne' as DragEdge, cx: rect.x + rect.w, cy: rect.y },
        { edge: 'sw' as DragEdge, cx: rect.x, cy: rect.y + rect.h },
        { edge: 'se' as DragEdge, cx: rect.x + rect.w, cy: rect.y + rect.h },
      ]).map(c => (
        <g key={c.edge}>
          <circle cx={c.cx} cy={c.cy} r="1.3" fill="red" className="pointer-events-none" />
          <circle cx={c.cx} cy={c.cy} r="4" fill="transparent"
            className={`cursor-${c.edge}-resize`}
            onMouseDown={e => onDown(e, c.edge)} />
        </g>
      ))}
    </svg>
  );
}

export function WeeklyPeriodization() {
  const [weekStart, setWeekStart] = useState(() => fmt(getMonday(new Date())));
  const [topic, setTopic] = useState('');
  const [weekLabel, setWeekLabel] = useState('');
  const [days, setDays] = useState<DayPlan[]>(() => Array.from({ length: 7 }, emptyDayPlan));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedWeeks, setSavedWeeks] = useState<{ week_start: string; week_label: string }[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);

  const loadSavedWeeks = useCallback(async () => {
    try { setSavedWeeks(await fetchSavedWeeks()); } catch { /* */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchWeeklyPeriodization(weekStart);
      if (data) {
        let parsed: unknown = data.days;
        while (typeof parsed === 'string') parsed = JSON.parse(parsed);
        const arr = Array.isArray(parsed) ? parsed : [];
        while (arr.length < 7) arr.push(emptyDayPlan());
        arr.forEach((d: DayPlan) => { if (!d.prep) d.prep = ''; });
        setDays(arr);
        setTopic(data.weekly_topic || '');
        setWeekLabel(data.week_label || '');
      } else {
        setDays(Array.from({ length: 7 }, emptyDayPlan));
        setTopic('');
        setWeekLabel('');
      }
    } catch { /* */ }
  }, [weekStart]);

  useEffect(() => { load(); loadSavedWeeks(); }, [load, loadSavedWeeks]);

  const updateDay = (idx: number, key: keyof DayPlan, value: string) => {
    setDays(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: value }; return next; });
    setSaved(false);
  };

  const updatePitch = (idx: number, rect: { x: number; y: number; w: number; h: number }) => {
    setDays(prev => { const next = [...prev]; next[idx] = { ...next[idx], pitch_rect: rect }; return next; });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertWeeklyPeriodization(weekStart, topic, weekLabel, days);
      setSaved(true);
      await loadSavedWeeks();
    } catch { /* */ }
    setSaving(false);
  };

  const prepareForCapture = (el: HTMLElement) => {
    const rollback: (() => void)[] = [];
    const setStyle = (target: HTMLElement, props: Record<string, string>) => {
      const orig = target.style.cssText;
      rollback.push(() => { target.style.cssText = orig; });
      for (const [k, v] of Object.entries(props)) target.style.setProperty(k, v, 'important');
    };

    setStyle(el, { background: '#ffffff', color: '#222', 'border-radius': '0', 'box-shadow': 'none', overflow: 'visible' });
    el.querySelectorAll<HTMLElement>('table').forEach(t => {
      setStyle(t, { width: '100%', 'table-layout': 'fixed', 'border-collapse': 'collapse' });
    });
    el.querySelectorAll<HTMLElement>('th').forEach(th => {
      setStyle(th, { background: '#f0f4f8', color: '#222', padding: '8px 6px', 'font-size': '11px', border: '1px solid #ccc', 'white-space': 'nowrap' });
    });
    el.querySelectorAll<HTMLElement>('td').forEach(td => {
      setStyle(td, { background: '#ffffff', color: '#222', padding: '6px 4px', 'font-size': '11px', border: '1px solid #ddd', 'vertical-align': 'middle' });
    });
    el.querySelectorAll<HTMLElement>('td.row-label').forEach(td => {
      setStyle(td, { background: '#f0f4f8', color: '#333', 'font-weight': '600' });
    });
    el.querySelectorAll<HTMLElement>('td.total-col').forEach(td => {
      setStyle(td, { background: '#e8f8f5', color: '#00897b', 'font-weight': '600' });
    });
    el.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(ta => {
      const span = document.createElement('span');
      span.textContent = ta.value || '';
      span.style.cssText = 'font-size:11px;color:#222;white-space:pre-wrap;word-break:break-word;display:block;text-align:center;';
      ta.parentNode?.insertBefore(span, ta);
      setStyle(ta, { display: 'none' });
      rollback.push(() => { span.remove(); });
    });
    el.querySelectorAll('svg text').forEach(t => {
      const origFill = t.getAttribute('fill');
      t.setAttribute('fill', '#333');
      rollback.push(() => { if (origFill) t.setAttribute('fill', origFill); });
    });
    el.querySelectorAll('svg line, svg rect').forEach(el => {
      const origStroke = el.getAttribute('stroke');
      if (origStroke && origStroke !== 'none') {
        el.setAttribute('stroke', '#555');
        rollback.push(() => { el.setAttribute('stroke', origStroke); });
      }
    });
    el.querySelectorAll<HTMLElement>('.pitch-cell').forEach(td => {
      setStyle(td, { padding: '2px', 'text-align': 'center', 'vertical-align': 'middle' });
    });
    el.querySelectorAll<HTMLElement>('.pitch-cell > div').forEach(d => {
      setStyle(d, { display: 'flex', 'justify-content': 'center', 'align-items': 'center' });
    });

    return () => rollback.forEach(fn => fn());
  };

  const handlePDF = async () => {
    if (!tableRef.current) return;
    const el = tableRef.current;
    const CAPTURE_W = 1400;
    const origCss = el.style.cssText;
    el.style.cssText = `width:${CAPTURE_W}px;min-width:${CAPTURE_W}px;max-width:${CAPTURE_W}px;overflow:visible;background:#fff;padding:4px 2px;`;

    const restore = prepareForCapture(el);
    await new Promise(r => setTimeout(r, 300));

    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: CAPTURE_W });

    restore();
    el.style.cssText = origCss;

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdfW = 420, pdfH = pdfW * (canvas.height / canvas.width);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pdfW, pdfH] });
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
    pdf.save(`주간주기화_${weekLabel || weekStart}.pdf`);
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(weekStart), i);
    return { label: `${d.getMonth() + 1}월 ${d.getDate()}일`, dayLabel: DAY_LABELS[i] };
  });

  const prevWeek = () => setWeekStart(fmt(addDays(new Date(weekStart), -7)));
  const nextWeek = () => setWeekStart(fmt(addDays(new Date(weekStart), 7)));

  const handleWeekSelect = (ws: string) => {
    setWeekStart(ws);
    setSaved(false);
  };

  const totals: Record<string, string> = {};
  for (const key of NUMERIC_ROWS) {
    const sum = days.map(d => parseRange(d[key as keyof DayPlan] as string)).reduce((a, b) => a + b, 0);
    if (key === 'time') totals[key] = sum > 0 ? `${Math.round(sum)}'` : '-';
    else totals[key] = sum > 0 ? Math.round(sum).toLocaleString() : '-';
  }

  const C = 'px-1 py-1 text-[11px] border border-surface-secondary text-center align-middle';
  const I = 'w-full bg-transparent text-center text-[11px] outline-none break-words whitespace-pre-wrap resize-none overflow-hidden';

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-cyan-400 rounded-sm inline-block" />
        주간 주기화
      </h1>

      {/* 주차 + 날짜 네비게이션 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* 저장된 주차 바로가기 */}
        {savedWeeks.length > 0 && (
          <select value={weekStart}
            onChange={e => handleWeekSelect(e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-cyan-400 bg-surface outline-none text-cyan-400 font-medium">
            {!savedWeeks.find(w => w.week_start === weekStart) && (
              <option value={weekStart}>새 주차</option>
            )}
            {savedWeeks.map(w => {
              const mon = new Date(w.week_start);
              const sun = addDays(mon, 6);
              const range = `${mon.getMonth()+1}/${mon.getDate()} ~ ${sun.getMonth()+1}/${sun.getDate()}`;
              return (
                <option key={w.week_start} value={w.week_start}>
                  {w.week_label ? `${w.week_label} (${range})` : range}
                </option>
              );
            })}
          </select>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-secondary">주차명:</span>
          <input type="text" value={weekLabel} onChange={e => { setWeekLabel(e.target.value); setSaved(false); }}
            placeholder="예: W1"
            className="px-2 py-1.5 text-sm rounded border border-surface-secondary bg-surface w-24 outline-none" />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-3 py-1.5 text-sm rounded border border-surface-secondary hover:bg-surface-secondary">◀</button>
          <input type="date" value={weekStart}
            onChange={e => {
              const d = new Date(e.target.value);
              setWeekStart(fmt(getMonday(d)));
            }}
            className="px-3 py-1.5 text-sm rounded border border-surface-secondary bg-surface" />
          <span className="text-sm text-text-secondary">{weekDates[0].label} ~ {weekDates[6].label}</span>
          <button onClick={nextWeek} className="px-3 py-1.5 text-sm rounded border border-surface-secondary hover:bg-surface-secondary">▶</button>
        </div>

        <div className="flex-1" />
        <button onClick={handlePDF}
          className="px-4 py-1.5 text-sm rounded border border-surface-secondary hover:bg-surface-secondary transition-colors flex items-center gap-1.5">
          📥 PDF 다운로드
        </button>
        <button onClick={handleSave} disabled={saving}
          className={`px-5 py-1.5 text-sm rounded font-medium transition-colors ${
            saved ? 'bg-green-500/20 text-green-400 border border-green-400' : 'bg-cyan-400 text-black hover:bg-cyan-300'
          } disabled:opacity-50`}>
          {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
        </button>
      </div>

      {/* 테이블 */}
      <div ref={tableRef} className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-x-auto">
        <table className="w-full border-collapse min-w-[1100px]">
          <thead>
            <tr>
              <th className={`${C} w-28 bg-surface-secondary/50 font-medium text-text-secondary`}></th>
              {weekDates.map((d, i) => (
                <th key={i} className={`${C} bg-surface-secondary/50 font-medium min-w-[120px]`}>
                  <div className="text-text-secondary text-[10px]">{d.dayLabel}</div>
                  <div>{d.label}</div>
                </th>
              ))}
              <th className={`${C} w-32 bg-cyan-400/10 font-medium text-cyan-400`}>Weekly Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${C} bg-surface-secondary/30 font-medium text-text-secondary text-left pl-3 row-label`}>Weekly Topic</td>
              <td colSpan={7} className={C}>
                <AutoCell value={topic} onChange={v => { setTopic(v); setSaved(false); }} className={`${I} text-left`} />
              </td>
              <td className={C}></td>
            </tr>

            {ROW_LABELS.map((label, ri) => {
              const key = ROW_KEYS[ri];
              const isNum = NUMERIC_ROWS.includes(key);
              const isIntensity = key === 'intensity';
              return (
                <tr key={key}>
                  <td className={`${C} bg-surface-secondary/30 font-medium text-text-secondary text-left pl-3 row-label`}>{label}</td>
                  {days.map((day, di) => (
                    <td key={di} className={C}>
                      <AutoCell value={day[key] as string}
                        onChange={v => updateDay(di, key, v)}
                        onBlur={isIntensity ? () => {
                          const v = (day[key] as string).trim();
                          if (v && /^\d+$/.test(v)) updateDay(di, key, v + '%');
                        } : undefined}
                        className={I} />
                    </td>
                  ))}
                  <td className={`${C} bg-cyan-400/5 font-medium text-cyan-400 total-col`}>{isNum ? totals[key] : ''}</td>
                </tr>
              );
            })}

            <tr>
              <td className={`${C} bg-surface-secondary/30 font-medium text-text-secondary text-left pl-3 row-label`}>피치 사이즈</td>
              {days.map((day, di) => (
                <td key={di} className={`${C} p-1 pitch-cell`}>
                  <div className="flex justify-center items-center">
                    <div style={{ width: 72, height: 110 }}>
                      <PitchDiagram
                        rect={day.pitch_rect || { x: 5, y: 5, w: 58, h: 95 }}
                        onChange={r => updatePitch(di, r)}
                      />
                    </div>
                  </div>
                </td>
              ))}
              <td className={C}></td>
            </tr>

            <tr>
              <td className={`${C} bg-surface-secondary/30 font-medium text-text-secondary text-left pl-3 row-label`}>Prep</td>
              {days.map((day, di) => (
                <td key={di} className={C}>
                  <AutoCell value={day.prep} onChange={v => updateDay(di, 'prep', v)} className={I} />
                </td>
              ))}
              <td className={C}></td>
            </tr>

            <tr>
              <td className={`${C} bg-surface-secondary/30 font-medium text-text-secondary text-left pl-3 row-label`}>Warm up</td>
              {days.map((day, di) => (
                <td key={di} className={C}>
                  <AutoCell value={day.warmup} onChange={v => updateDay(di, 'warmup', v)} className={I} />
                </td>
              ))}
              <td className={C}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
