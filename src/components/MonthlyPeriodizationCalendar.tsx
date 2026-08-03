// 월간 주기화 캘린더 — 주마다 DAY/CONTENTS/KEY 3행 구조.
//
// 팀 단위 캘린더다. 경기 일정(match_schedule)이 팀 공용 입력이고, 여기서 등록한 경기가
// MD 코드의 기준이 돼 주간 주기화·리포트까지 같은 값을 쓴다.
//
// 자동값을 덮어쓸 수 있고, calendar_day_override에는 덮어쓴 항목만 저장된다.
// 강도만 고치면 내용은 계속 자동값을 따라간다. 되돌리기는 행 삭제.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchMatchSchedule, fetchCalendarOverrides, fetchMatchDates,
  fetchTrainingDays, fetchPlannedGoals,
  saveCalendarOverride, clearCalendarOverride, insertMatchSchedule, deleteMatchSchedule,
  type MatchScheduleRow, type CalendarDayOverride,
} from '../lib/api';
import { mdCodesFor, mergeMatchDates } from '../lib/mdCode';
import { INTENSITY_STYLE, mdIntensityKey } from '../lib/periodizationPlan';
import { invalidateMatchDates } from '../lib/useMatchDates';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const INTENSITY_KEYS = Object.keys(INTENSITY_STYLE);
const EVENT_TYPES = ['K리그주니어', '연습경기', '대회'];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 일요일 시작 격자. Date 생성자가 음수·초과 일수를 앞뒤 달로 넘겨주므로 1일 기준 오프셋만 센다.
function monthWeeks(year: number, month: number): Date[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const weeks: Date[][] = [];
  while (weeks.length < 6) {
    const offset = 1 - firstDow + weeks.length * 7;
    weeks.push(Array.from({ length: 7 }, (_, i) => new Date(year, month, offset + i)));
    if (offset + 6 >= lastDate) break;
  }
  return weeks;
}

interface PastMatch { date: string; opponent: string; event_type: string }

export function MonthlyPeriodizationCalendar({ onScheduleChange }: { onScheduleChange?: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [pastMatches, setPastMatches] = useState<PastMatch[]>([]);
  const [fixtures, setFixtures] = useState<MatchScheduleRow[]>([]);
  const [overrides, setOverrides] = useState<CalendarDayOverride[]>([]);
  const [trainingDays, setTrainingDays] = useState<Map<string, number>>(new Map());
  const [plannedGoals, setPlannedGoals] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftIntensity, setDraftIntensity] = useState('');
  const [saving, setSaving] = useState(false);
  const [fixture, setFixture] = useState({ event_type: EVENT_TYPES[0], opponent: '', home: true, kickoff: '10:00' });

  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  const rangeStart = weeks[0][0];
  const rangeEnd = weeks[weeks.length - 1][6];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [past, fx, ov, td, goals] = await Promise.all([
        fetchMatchDates(),
        fetchMatchSchedule(),
        fetchCalendarOverrides(isoDate(rangeStart), isoDate(rangeEnd)),
        fetchTrainingDays(isoDate(rangeStart), isoDate(rangeEnd)),
        fetchPlannedGoals(isoDate(rangeStart), isoDate(rangeEnd)),
      ]);
      setPastMatches(past);
      setFixtures(fx);
      setOverrides(ov);
      setTrainingDays(td);
      setPlannedGoals(goals);
    } catch (e) {
      setError(e instanceof Error ? e.message : '캘린더를 불러오지 못했습니다');
    }
    setLoading(false);
  }, [rangeStart.getTime(), rangeEnd.getTime()]);

  useEffect(() => { load(); }, [load]);

  // 편집기가 표 아래에 열려서 좁은 화면에서는 화면 밖이다. 열릴 때 한 번만 끌어온다.
  useEffect(() => {
    if (editing) editorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [editing]);

  const allDates = weeks.flat().map(isoDate);
  const pastDates = pastMatches.map(m => m.date);
  const mdLabels = useMemo(
    () => mdCodesFor(allDates, mergeMatchDates(pastDates, fixtures.map(f => f.match_date))),
    [allDates.join(), pastDates.join(), fixtures],
  );

  const pastByDate = useMemo(() => {
    const m = new Map<string, PastMatch[]>();
    for (const p of pastMatches) { const l = m.get(p.date) ?? []; l.push(p); m.set(p.date, l); }
    return m;
  }, [pastMatches]);
  const fixtureByDate = useMemo(() => {
    const m = new Map<string, MatchScheduleRow[]>();
    for (const f of fixtures) { const l = m.get(f.match_date) ?? []; l.push(f); m.set(f.match_date, l); }
    return m;
  }, [fixtures]);
  const overrideByDate = useMemo(() => new Map(overrides.map(o => [o.plan_date, o])), [overrides]);

  function goMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setEditing(null);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const todayIso = isoDate(now);

  // 경기 > 훈련 기록 순으로 보여준다. 훈련일에는 주간 주기화에 적어 둔 목표와
  // 실제 참여 인원을 함께 붙여, 계획과 기록을 한 칸에서 확인할 수 있게 한다.
  function autoContentOf(iso: string) {
    const fx = fixtureByDate.get(iso);
    if (fx?.length) return fx.map(f => `${f.event_type}\n${f.opponent} (${f.home ? 'H' : 'A'})`).join('\n');
    const past = pastByDate.get(iso);
    if (past?.length) return past.map(p => `${p.event_type}\n${p.opponent}`).join('\n');

    const goal = plannedGoals.get(iso);
    const players = trainingDays.get(iso);
    if (players) return goal ? `${goal}\n훈련 ${players}명` : `훈련 ${players}명`;
    if (goal) return `${goal}\n(기록 없음)`;
    return '기록 없음';
  }

  function openEditor(iso: string) {
    const ov = overrideByDate.get(iso);
    setEditing(iso);
    setDraftContent(ov?.content ?? '');
    setDraftIntensity(ov?.intensity_key ?? '');
    setFixture({ event_type: EVENT_TYPES[0], opponent: '', home: true, kickoff: '10:00' });
  }

  // 경기 등록·삭제. MD 코드가 다시 계산되므로 상위(주기화 페이지)에도 알려 같은 일정을 보게 한다.
  async function commitFixture(action: 'add' | 'remove', id?: string) {
    if (!editing) return;
    setSaving(true);
    try {
      if (action === 'add') await insertMatchSchedule({ ...fixture, match_date: editing, note: '' });
      else await deleteMatchSchedule(id!);
      invalidateMatchDates();
      await load();
      onScheduleChange?.();
      setFixture(f => ({ ...f, opponent: '' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '경기 일정을 바꾸지 못했습니다');
    }
    setSaving(false);
  }

  async function commitEdit(action: 'save' | 'reset') {
    if (!editing) return;
    setSaving(true);
    try {
      if (action === 'save') await saveCalendarOverride({ plan_date: editing, content: draftContent, intensity_key: draftIntensity || null });
      else await clearCalendarOverride(editing);
      await load();
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다');
    }
    setSaving(false);
  }

  const autoKey = editing ? mdIntensityKey(mdLabels.get(editing)?.code ?? null) : '';
  const autoCode = editing ? mdLabels.get(editing)?.code ?? null : null;

  return (
    <div className="chart-card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="chart-title !mb-0">월간 주기화</div>
        <div className="flex items-center gap-2">
          <button onClick={() => goMonth(-1)} aria-label="이전 달"
            className="w-9 h-9 rounded border border-surface-secondary hover:bg-surface-secondary">‹</button>
          <span className="font-bold text-sm" style={{ minWidth: 96, textAlign: 'center' }}>{year}년 {month + 1}월</span>
          <button onClick={() => goMonth(1)} aria-label="다음 달"
            className="w-9 h-9 rounded border border-surface-secondary hover:bg-surface-secondary">›</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {INTENSITY_KEYS.map(key => (
          <span key={key} className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ background: INTENSITY_STYLE[key].bg, color: INTENSITY_STYLE[key].color }}>{key}</span>
        ))}
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: 'var(--color-purple-light)', color: 'var(--color-purple)' }}>
          {error}
          <button onClick={load} className="ml-2 underline font-bold">다시 시도</button>
        </div>
      )}

      {loading ? (
        <div className="text-text-secondary text-sm py-8 text-center">로딩 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 1080 }}>
            <thead>
              <tr>
                {DOW.map((d, i) => (
                  <th key={d} className="text-xs font-bold py-1.5"
                    style={{ border: '1px solid var(--color-surface-secondary)', color: i === 0 ? 'var(--color-purple)' : i === 6 ? 'var(--color-recovery)' : 'inherit' }}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => {
                const cells = week.map(d => {
                  const iso = isoDate(d);
                  const inMonth = d.getMonth() === month;
                  const code = inMonth ? mdLabels.get(iso)?.code ?? null : null;
                  const ov = inMonth ? overrideByDate.get(iso) : undefined;
                  return {
                    d, iso, inMonth, code,
                    key: ov?.intensity_key ?? mdIntensityKey(code),
                    content: inMonth ? ov?.content ?? autoContentOf(iso) : '',
                    // 경기일만 굵게. 수기로 덮어쓴 칸은 그 강조를 물려받지 않는다.
                    isMatch: ov?.content == null && (!!fixtureByDate.get(iso)?.length || !!pastByDate.get(iso)?.length),
                    edited: !!ov,
                    active: editing === iso,
                  };
                });
                const cellBg = (c: typeof cells[number]) => c.active ? 'var(--color-purple-light)' : c.iso === todayIso ? '#FFF4D6' : undefined;
                return (
                  <Fragment key={wi}>
                    <tr>
                      {cells.map(c => (
                        <td key={c.iso} className="text-center py-1"
                          style={{ border: '1px solid var(--color-surface-secondary)', background: cellBg(c), opacity: c.inMonth ? 1 : 0.3 }}>
                          <span className="text-xs font-bold">{c.d.getDate()}</span>
                          {c.code && <span className="ml-1 text-xs text-text-secondary">{c.code}</span>}
                          {c.edited && <span className="ml-1 text-xs" aria-label="수기 수정됨">✎</span>}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      {cells.map(c => (
                        <td key={c.iso} className="align-top p-0"
                          style={{ border: '1px solid var(--color-surface-secondary)', background: cellBg(c), opacity: c.inMonth ? 1 : 0.3 }}>
                          {c.inMonth ? (
                            <button onClick={() => openEditor(c.iso)}
                              aria-label={`${c.iso} 내용·강도 수정`}
                              className="w-full text-left px-1 py-1 hover:bg-surface-secondary"
                              style={{ minHeight: 48 }}>
                              <span className={`block text-xs leading-tight whitespace-pre-line ${c.isMatch ? 'font-bold' : 'text-text-secondary'}`}>
                                {c.content}
                              </span>
                            </button>
                          ) : <div style={{ minHeight: 48 }} />}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      {cells.map(c => {
                        const s = INTENSITY_STYLE[c.key] ?? INTENSITY_STYLE.REST;
                        return (
                          <td key={c.iso} className="text-center p-0"
                            style={{ border: '1px solid var(--color-surface-secondary)', background: c.inMonth ? s.bg : undefined, opacity: c.inMonth ? 1 : 0.3 }}>
                            {c.inMonth && (
                              <button onClick={() => openEditor(c.iso)} aria-label={`${c.iso} 강도 ${c.key}, 수정`}
                                className="w-full py-1.5 text-xs font-bold" style={{ color: s.color }}>
                                {c.key}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div ref={editorRef}
          className="mt-4 p-3 rounded-lg border border-surface-secondary" style={{ background: 'var(--color-surface-secondary)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold">
              {editing} 수정
              {autoCode && <span className="ml-2 text-xs text-text-secondary font-normal">자동 {autoCode}</span>}
            </div>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs text-text-secondary hover:underline">닫기</button>
          </div>

          {/* 경기 등록이 MD의 유일한 근거다. 아래 내용·강도는 표시만 바꾸므로 이 칸을 먼저 보여준다. */}
          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-purple)' }}>
            <div className="text-xs font-bold mb-1.5" style={{ color: 'var(--color-purple)' }}>
              ① 경기 일정 <span className="font-normal text-text-secondary">— 경기인 날은 여기에 등록해야 MD 코드가 웹 전체에 반영됩니다</span>
            </div>
            {(fixtureByDate.get(editing) ?? []).map(f => (
              <div key={f.id} className="flex items-center gap-2 mb-1.5 text-xs">
                <span className="font-bold">{f.event_type}</span>
                <span>{f.opponent} ({f.home ? '홈' : '원정'}){f.kickoff ? ` ${f.kickoff.slice(0, 5)}` : ''}</span>
                <button onClick={() => commitFixture('remove', f.id)} disabled={saving}
                  className="px-2 py-1 rounded border border-surface-secondary hover:bg-surface disabled:opacity-50">삭제</button>
              </div>
            ))}
            <div className="flex items-end gap-2 flex-wrap">
              <select value={fixture.event_type} onChange={e => setFixture({ ...fixture, event_type: e.target.value })}
                aria-label="대회 구분"
                className="px-2 py-2 text-xs rounded border border-surface-secondary bg-surface outline-none">
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={fixture.opponent} onChange={e => setFixture({ ...fixture, opponent: e.target.value })}
                placeholder="상대 팀" aria-label="상대 팀"
                className="px-2 py-2 text-xs rounded border border-surface-secondary bg-surface w-32 outline-none" />
              <select value={fixture.home ? 'H' : 'A'} onChange={e => setFixture({ ...fixture, home: e.target.value === 'H' })}
                aria-label="홈/원정"
                className="px-2 py-2 text-xs rounded border border-surface-secondary bg-surface outline-none">
                <option value="H">홈</option>
                <option value="A">원정</option>
              </select>
              <input type="time" value={fixture.kickoff} onChange={e => setFixture({ ...fixture, kickoff: e.target.value })}
                aria-label="킥오프"
                className="px-2 py-2 text-xs rounded border border-surface-secondary bg-surface outline-none" />
              <button onClick={() => commitFixture('add')} disabled={saving || !fixture.opponent.trim()}
                className="px-3 py-2 rounded text-xs font-bold border border-surface-secondary hover:bg-surface disabled:opacity-50">
                경기 등록
              </button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-surface-secondary">
            <div className="text-xs font-bold text-text-secondary mb-1.5">
              ② 표시 내용 <span className="font-normal text-text-disabled">— 캘린더에 보이는 글자·색만 바꿉니다. MD 코드에는 영향을 주지 않습니다</span>
            </div>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-[2fr_1fr]">
              <div>
                <label className="text-xs font-bold text-text-secondary block mb-1" htmlFor="cal-content">내용 (CONTENTS)</label>
                <textarea id="cal-content" value={draftContent} onChange={e => setDraftContent(e.target.value)} rows={3}
                  placeholder={`자동: ${autoContentOf(editing) || '—'}`}
                  className="w-full text-sm p-2 rounded border border-surface-secondary bg-surface outline-none" />
                <div className="text-xs text-text-disabled mt-1">비워두면 자동값을 씁니다</div>
              </div>
              <div>
                <label className="text-xs font-bold text-text-secondary block mb-1" htmlFor="cal-intensity">강도 (KEY)</label>
                <select id="cal-intensity" value={draftIntensity} onChange={e => setDraftIntensity(e.target.value)}
                  className="w-full text-sm p-2 rounded border border-surface-secondary bg-surface outline-none">
                  <option value="">자동 ({autoKey})</option>
                  {INTENSITY_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <div className="text-xs text-text-disabled mt-1">색만 바뀌고 MD 코드는 일정을 따릅니다</div>
              </div>
            </div>
          </div>

          {/* 강도만 MATCH로 바꾸고 경기를 등록하지 않으면 색만 바뀌고 MD가 안 붙는다 — 흔한 실수라 짚어준다. */}
          {draftIntensity === 'MATCH' && !(fixtureByDate.get(editing) ?? []).length && (
            <div className="mt-2.5 px-3 py-2 rounded text-xs font-medium"
              style={{ background: '#FFF4D6', color: '#7F6000' }}>
              강도를 MATCH로 두셨지만 이 날짜에 등록된 경기가 없습니다. 색만 바뀌고 MD 코드(MD-4 ~ MD+2)는 붙지 않습니다 —
              위 <b>① 경기 일정</b>에서 경기를 등록해 주세요.
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => commitEdit('save')} disabled={saving}
              className="px-4 py-2 rounded text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--color-purple)' }}>
              {saving ? '저장 중…' : '표시 내용 저장'}
            </button>
            {overrideByDate.has(editing) && (
              <button onClick={() => commitEdit('reset')} disabled={saving}
                className="px-4 py-2 rounded text-sm font-bold border border-surface-secondary hover:bg-surface disabled:opacity-50">
                자동으로 되돌리기
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-text-disabled">
        이미 치른 경기(match_data)와 여기서 등록한 예정 경기를 합쳐 MD 코드를 계산합니다 ·
        수기 수정한 칸에는 ✎ 표시가 붙습니다
      </div>
    </div>
  );
}
