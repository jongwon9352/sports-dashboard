import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchRawDataByDates, deleteRawDataRows, fetchAllTrainingDates, fetchGoogleSheetRpe, updateRpe, updateGroupType, fetchDatesWithMultipleSessions, fetchRawDataSessionsByDate, upsertSessionRpe, upsertSessionGroup, type RawDataRow, type GoogleSheetRpe } from '../lib/api';

const GROUP_TYPES = ['U15', 'U14', 'U13', 'GK', 'RE'] as const;

const PAGE_SIZE = 40;

type ColDef =
  | { key: keyof RawDataRow; label: string; computed?: undefined }
  | { key: 'action_no' | 'day_tl'; label: string; computed: true };

const COLUMNS: ColDef[] = [
  { key: 'player_name', label: '이름' },
  { key: 'group_type', label: '그룹' },
  { key: 'duration_min', label: 'TIME' },
  { key: 'rpe', label: 'RPE' },
  { key: 'total_distance', label: 'TD' },
  { key: 'speed_zone_1', label: '속도 1구' },
  { key: 'speed_zone_2', label: '속도 2구' },
  { key: 'speed_zone_3', label: '속도 3구' },
  { key: 'speed_zone_4', label: '속도 4구' },
  { key: 'speed_zone_5', label: '속도 5구' },
  { key: 'm_per_min', label: 'm/min' },
  { key: 'hsr_distance', label: 'HSR(m)' },
  { key: 'sprint_distance', label: 'Sprint(m)' },
  { key: 'sprint_count', label: 'SPRINT n' },
  { key: 'acc_count', label: 'ACC' },
  { key: 'dec_count', label: 'DEC' },
  { key: 'acd_load', label: 'ACD LOAD' },
  { key: 'max_speed', label: 'SPEED' },
  { key: 'action_no', label: 'ACTION no.', computed: true },
  { key: 'day_tl', label: 'DAY TL', computed: true },
];

const TOTAL_COLS = COLUMNS.length;

export function RawDataPage() {
  const [data, setData] = useState<RawDataRow[]>([]);
  const [sheetRpe, setSheetRpe] = useState<GoogleSheetRpe[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [multiSessionDates, setMultiSessionDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [savingRpe, setSavingRpe] = useState<string | null>(null);

  const loadDates = useCallback(async () => {
    try {
      const dates = await fetchAllTrainingDates();
      setAvailableDates(dates);
      if (dates.length > 0 && !selectedDate) {
        setSelectedDate(dates[0]);
      }
    } catch {
      // silently fail
    }
  }, [selectedDate]);

  useEffect(() => { loadDates(); }, [loadDates]);

  useEffect(() => {
    fetchDatesWithMultipleSessions().then(setMultiSessionDates).catch(() => {});
  }, []);

  useEffect(() => {
    fetchGoogleSheetRpe().then(setSheetRpe).catch(() => {});
  }, []);

  const [dateOnly, sessionLabel] = selectedDate.split('::');
  const isSessionView = Boolean(sessionLabel);

  const rpeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of sheetRpe) {
      if (isSessionView && r.session !== sessionLabel) continue;
      map.set(`${r.date}|${r.name}`, r.rpe);
    }
    return map;
  }, [sheetRpe, isSessionView, sessionLabel]);

  const loadData = useCallback(async () => {
    if (!dateOnly) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (sessionLabel) {
        const sessions = await fetchRawDataSessionsByDate(dateOnly);
        setData(sessions.find(s => s.label === sessionLabel)?.rows ?? []);
      } else {
        const rows = await fetchRawDataByDates([dateOnly]);
        setData(rows);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [dateOnly, sessionLabel]);

  useEffect(() => { loadData(); }, [loadData]);

  // 구글 시트 RPE를 DB에 영속화 (시트값과 DB값이 다른 행만, 세션 뷰는 읽기 전용이라 제외)
  useEffect(() => {
    if (isSessionView || !data.length || rpeMap.size === 0) return;
    const toSync: { id: string; rpe: number }[] = [];
    for (const row of data) {
      const sheetValue = rpeMap.get(`${row.training_date}|${row.player_name}`);
      if (sheetValue != null && row.rpe !== sheetValue) {
        toSync.push({ id: row.id, rpe: sheetValue });
      }
    }
    if (toSync.length === 0) return;
    Promise.all(toSync.map(r => updateRpe(r.id, r.rpe).catch(() => {}))).then(() => {
      setData(prev => prev.map(r => {
        const match = toSync.find(s => s.id === r.id);
        return match ? { ...r, rpe: match.rpe } : r;
      }));
    });
  }, [data, rpeMap, isSessionView]);

  const mergedData = useMemo(() => {
    return data.map(row => {
      const key = `${row.training_date}|${row.player_name}`;
      const sheetValue = rpeMap.get(key);
      if (sheetValue != null) {
        return { ...row, rpe: sheetValue, _rpeSource: 'sheet' as const };
      }
      return { ...row, _rpeSource: (row.rpe != null ? 'db' : 'none') as 'db' | 'none' };
    });
  }, [data, rpeMap]);

  const filtered = useMemo(() => {
    return mergedData.filter(row => {
      if (search && !row.player_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedPlayer && row.player_name !== selectedPlayer) return false;
      return true;
    }).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [mergedData, search, selectedPlayer]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageData = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, selectedPlayer, selectedDate]);

  const uniqueNames = useMemo(() => [...new Set(mergedData.map(r => r.player_name))].sort(), [mergedData]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const pageIds = pageData.map(r => r.id);
    const allSelected = pageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
    try {
      await deleteRawDataRows([...selected]);
      setSelected(new Set());
      await loadData();
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleRpeChange = async (row: RawDataRow, value: string) => {
    const rpe = parseInt(value);
    if (isNaN(rpe)) return;
    setSavingRpe(row.id);
    try {
      if (isSessionView) {
        await upsertSessionRpe(dateOnly, sessionLabel as '오전' | '오후', row.player_id, rpe);
      } else {
        await updateRpe(row.id, rpe);
      }
      setData(prev => prev.map(r => r.id === row.id ? { ...r, rpe } : r));
    } catch {
      alert('RPE 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingRpe(null);
    }
  };

  const getCellValue = (row: RawDataRow, col: ColDef): number | string | null => {
    if (col.computed) {
      if (col.key === 'action_no') return row.acc_count + row.dec_count;
      if (col.key === 'day_tl') {
        if (row.rpe == null) return null;
        return +(row.rpe * row.duration_min).toFixed(1);
      }
      return null;
    }
    return row[col.key];
  };

  const handleCsvExport = () => {
    const header = COLUMNS.map(c => c.label).join(',');
    const rows = filtered.map(row =>
      COLUMNS.map(c => getCellValue(row, c) ?? '').join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `로우데이터_${selectedDate || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (v: number | string | null) => {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (v === 0) return '0';
    return Number.isInteger(v) ? v.toLocaleString() : (+v.toFixed(1)).toLocaleString();
  };

  const pageAllSelected = pageData.length > 0 && pageData.every(r => selected.has(r.id));

  const handleGroupChange = async (row: RawDataRow, val: string) => {
    try {
      if (isSessionView) {
        await upsertSessionGroup(dateOnly, sessionLabel as '오전' | '오후', row.player_id, val);
      } else {
        await updateGroupType(row.id, val);
      }
      setData(prev => prev.map(r => r.id === row.id ? { ...r, group_type: val || null } : r));
    } catch { /* */ }
  };

  const renderCell = (row: typeof mergedData[0], col: ColDef) => {
    if (col.key === 'group_type') {
      return (
        <select
          value={row.group_type || ''}
          onChange={e => handleGroupChange(row, e.target.value)}
          className="w-[52px] px-1 py-0.5 text-[10px] rounded border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          <option value="">—</option>
          {GROUP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      );
    }
    if (col.key === 'rpe') {
      const fromSheet = row._rpeSource === 'sheet';
      if (fromSheet) {
        return (
          <span className="text-cyan-400 font-medium" title="구글 시트에서 자동 입력">
            {row.rpe}
          </span>
        );
      }
      return (
        <select
          value={row.rpe != null ? String(row.rpe) : ''}
          onChange={e => handleRpeChange(row, e.target.value)}
          disabled={savingRpe === row.id}
          className={`w-[52px] px-1 py-0.5 text-sm rounded border bg-[var(--bg)] focus:outline-none focus:border-cyan-400 ${
            row.rpe != null
              ? 'border-surface-secondary text-[var(--text)]'
              : 'border-yellow-500/50 text-yellow-400'
          } ${savingRpe === row.id ? 'opacity-50' : ''}`}
          style={{ fontFamily: 'var(--font-data)' }}
        >
          <option value="">—</option>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </select>
      );
    }

    if (col.key === 'day_tl') {
      if (row.rpe == null) return <span className="text-text-secondary">—</span>;
      return fmt(+(row.rpe * row.duration_min).toFixed(1));
    }

    if (col.computed && col.key === 'action_no') {
      return fmt(row.acc_count + row.dec_count);
    }

    const val = getCellValue(row, col);
    const isName = col.key === 'player_name';
    return <span className={isName ? 'font-medium' : ''}>{fmt(val)}</span>;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-72px)]">
      {/* 헤더 */}
      <div className="p-6 pb-4 flex-shrink-0">
        <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-400 rounded-sm inline-block" />
          로우 데이터
          <span className="text-sm font-normal text-text-secondary ml-2" style={{ fontFamily: 'var(--font-data)' }}>
            ({filtered.length}건 · {TOTAL_COLS}개 컬럼)
          </span>
        </h1>

        {/* 필터 바 */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="이름 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400 w-[140px]"
            style={{ fontFamily: 'var(--font-data)' }}
          />
          <select
            value={selectedPlayer}
            onChange={e => setSelectedPlayer(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400"
          >
            <option value="">전체 선수</option>
            {uniqueNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400"
          >
            {availableDates.length === 0 && <option value="">날짜 없음</option>}
            {availableDates.map(date => (
              multiSessionDates.has(date) ? (
                <optgroup key={date} label={date}>
                  <option value={`${date}::오전`}>{date} (오전)</option>
                  <option value={`${date}::오후`}>{date} (오후)</option>
                </optgroup>
              ) : (
                <option key={date} value={date}>{date}</option>
              )
            ))}
          </select>
          {isSessionView && (
            <span className="text-xs px-2 py-1 rounded-md border border-yellow-500/50 text-yellow-400">
              읽기 전용 (세션별 보기)
            </span>
          )}
          <span className="text-sm ml-auto" style={{ fontFamily: 'var(--font-data)', color: 'var(--text-secondary)' }}>
            {filtered.length}건
          </span>
          {selected.size > 0 && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs rounded-md border border-red-400 text-red-400 hover:bg-red-400/10 transition-colors"
            >
              ✕ 선택 삭제 ({selected.size})
            </button>
          )}
          <button
            onClick={handleCsvExport}
            className="px-3 py-1.5 text-xs rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors flex items-center gap-1"
          >
            📥 CSV 내보내기
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto px-6">
        {loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-16">
            데이터가 없습니다. 데이터 관리에서 CSV 파일을 업로드하세요.
          </p>
        ) : (
          <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)', minWidth: 'max-content' }}>
                <thead>
                  <tr className="border-b border-surface-secondary">
                    {!isSessionView && (
                      <th className="px-2 py-2.5 text-left w-[36px] sticky top-0 bg-surface">
                        <input
                          type="checkbox"
                          checked={pageAllSelected}
                          onChange={toggleAll}
                          className="accent-cyan-400"
                        />
                      </th>
                    )}
                    {COLUMNS.map(col => (
                      <th
                        key={col.key}
                        className="px-2.5 py-2.5 text-left text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map(row => (
                    <tr
                      key={row.id}
                      className="border-b border-surface-secondary/50 hover:bg-surface-secondary/30 transition-colors"
                    >
                      {!isSessionView && (
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            className="accent-cyan-400"
                          />
                        </td>
                      )}
                      {COLUMNS.map(col => (
                        <td key={col.key} className="px-2.5 py-2 whitespace-nowrap">
                          {renderCell(row, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-surface-secondary">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-3 py-1 text-xs rounded border border-surface-secondary hover:border-cyan-400 hover:text-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              <span className="text-xs text-text-secondary" style={{ fontFamily: 'var(--font-data)' }}>
                {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-3 py-1 text-xs rounded border border-surface-secondary hover:border-cyan-400 hover:text-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
