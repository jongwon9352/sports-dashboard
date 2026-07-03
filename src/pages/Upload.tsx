import { useState, useCallback, useEffect, type DragEvent } from 'react';
import { parseSessionCsv, parseDailyCsv, parseMatchSessionCsv, parsePhysicalCsv, parseBodyCompositionCsv, extractDateFromFilename, parseMatchFilename, parseMatchSessionFilename } from '../utils/csvParser';
import {
  importDailyCsvRows,
  importSessionCsvRows,
  importMatchCsvRows,
  importMatchSessionCsvRows,
  importPhysicalCsvRows,
  importBodyCompositionCsvRows,
  analyzePlayerNamesForSeason,
  resolveAmbiguousPlayerName,
  saveCsvUploadRecord,
  fetchCsvUploads,
  deleteCsvUpload,
  fetchDataSummary,
  type CsvUploadRecord,
} from '../lib/api';

const CURRENT_YEAR = new Date().getFullYear();
const SEASON_YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1];

type FileType = 'session' | 'daily' | 'match' | 'match_session' | 'physical' | 'body_composition' | null;

function detectFileType(filename: string): FileType {
  if (parseMatchSessionFilename(filename)) return 'match_session';
  if (parseMatchFilename(filename)) return 'match';
  const normalized = filename.normalize('NFC').toLowerCase();
  if (normalized.includes('체성분') || normalized.includes('bodycomposition') || normalized.includes('body_composition')) return 'body_composition';
  if (normalized.includes('피지컬') || normalized.includes('vald') || normalized.includes('physical')) return 'physical';
  if (normalized.includes('리포트') || normalized.includes('report') || normalized.includes('테이블')) return 'session';
  if (normalized.includes('운동부하') || normalized.includes('모니터링') || normalized.includes('workload') || normalized.includes('trend')) return 'daily';
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

interface UploadStatus {
  filename: string;
  status: 'uploading' | 'success' | 'error';
  message?: string;
}

interface AmbiguousDialogState {
  fileName: string;
  items: { name: string; existingSeasons: number[] }[];
  resolve: (decisions: Map<string, boolean>) => void;
}

function AmbiguousNameDialog({ state, onSubmit }: { state: AmbiguousDialogState; onSubmit: (decisions: Map<string, boolean>) => void }) {
  const [answers, setAnswers] = useState<Map<string, boolean>>(new Map());

  const allAnswered = state.items.every(item => answers.has(item.name));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl p-6 w-[480px] max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-2">동명이인 확인</h2>
        <p className="text-xs text-text-secondary mb-4">
          "{state.fileName}" 파일에 있는 아래 이름은 다른 시즌({state.items.map(i => i.existingSeasons.join('/')).join(', ')})에만 등록되어 있습니다.
          기존 선수와 동일 인물인지 확인해주세요.
        </p>
        <div className="space-y-3">
          {state.items.map(item => (
            <div key={item.name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--bg)]">
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-[11px] text-text-secondary">기존 등록 시즌: {item.existingSeasons.join(', ')}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setAnswers(prev => new Map(prev).set(item.name, true))}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    answers.get(item.name) === true ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
                  }`}
                >
                  동일 인물
                </button>
                <button
                  onClick={() => setAnswers(prev => new Map(prev).set(item.name, false))}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    answers.get(item.name) === false ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
                  }`}
                >
                  신규 선수
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={() => onSubmit(answers)}
            disabled={!allAnswered}
            className="px-4 py-1.5 text-sm rounded bg-purple text-white disabled:opacity-50"
          >
            확인하고 계속 업로드
          </button>
        </div>
      </div>
    </div>
  );
}

export function Upload() {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<CsvUploadRecord[]>([]);
  const [summary, setSummary] = useState({ dateRange: '-', playerCount: 0, sessionCount: 0 });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const [seasonYear, setSeasonYear] = useState(CURRENT_YEAR);
  const [ambiguousDialog, setAmbiguousDialog] = useState<AmbiguousDialogState | null>(null);
  const loadData = useCallback(async () => {
    try {
      const [files, sum] = await Promise.all([fetchCsvUploads(), fetchDataSummary()]);
      setUploads(files);
      setSummary(sum);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 이름이 다른 시즌에만 등록되어 있으면 사용자에게 동일 인물인지 확인받고,
  // 확정된 이름→player_id 매핑(overrides)을 반환한다.
  const resolvePlayersForNames = useCallback(async (
    rows: { player_name: string }[], fileName: string,
  ): Promise<Map<string, string>> => {
    const { autoMap, ambiguous } = await analyzePlayerNamesForSeason(rows, seasonYear);
    if (ambiguous.length === 0) return autoMap;

    const decisions = await new Promise<Map<string, boolean>>(resolve => {
      setAmbiguousDialog({
        fileName,
        items: ambiguous.map(a => ({ name: a.name, existingSeasons: a.existingSeasons })),
        resolve,
      });
    });
    setAmbiguousDialog(null);

    for (const item of ambiguous) {
      const reuse = decisions.get(item.name) ?? false;
      const playerId = await resolveAmbiguousPlayerName(item.name, seasonYear, 0,
        reuse ? { reuseExisting: true, existingPlayerId: item.existingPlayerId } : { reuseExisting: false });
      autoMap.set(item.name, playerId);
    }
    return autoMap;
  }, [seasonYear]);

  const handleFiles = useCallback(async (files: FileList) => {
    const newStatuses: UploadStatus[] = [];

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.csv')) {
        newStatuses.push({ filename: file.name, status: 'error', message: 'CSV 파일만 업로드 가능합니다.' });
        continue;
      }

      const type = detectFileType(file.name) ?? 'daily';

      newStatuses.push({ filename: file.name, status: 'uploading' });
      setStatuses([...newStatuses]);

      const text = await file.text();
      const date = extractDateFromFilename(file.name);

      try {
        let rowCount = 0;
        if (type === 'match_session') {
          const rows = parseMatchSessionCsv(text);
          if (rows.length === 0) throw new Error('CSV에서 데이터를 파싱할 수 없습니다.');
          const overrides = await resolvePlayersForNames(rows, file.name);
          rowCount = await importMatchSessionCsvRows(rows, file.name, seasonYear, overrides);
        } else if (type === 'match') {
          const rows = parseDailyCsv(text);
          if (rows.length === 0) throw new Error('CSV에서 데이터를 파싱할 수 없습니다.');
          const overrides = await resolvePlayersForNames(rows, file.name);
          rowCount = await importMatchCsvRows(rows, file.name, seasonYear, overrides);
        } else if (type === 'session') {
          const rows = parseSessionCsv(text);
          if (rows.length === 0) throw new Error('CSV에서 데이터를 파싱할 수 없습니다.');
          const overrides = await resolvePlayersForNames(rows, file.name);
          await importSessionCsvRows(rows, date, seasonYear, overrides);
          rowCount = rows.length;
        } else if (type === 'physical') {
          const rows = parsePhysicalCsv(text);
          if (rows.length === 0) throw new Error('CSV에서 데이터를 파싱할 수 없습니다.');
          const overrides = await resolvePlayersForNames(rows, file.name);
          rowCount = await importPhysicalCsvRows(rows, date, seasonYear, overrides);
        } else if (type === 'body_composition') {
          const rows = parseBodyCompositionCsv(text);
          if (rows.length === 0) throw new Error('CSV에서 데이터를 파싱할 수 없습니다.');
          const overrides = await resolvePlayersForNames(rows, file.name);
          rowCount = await importBodyCompositionCsvRows(rows, date, seasonYear, overrides);
        } else {
          const rows = parseDailyCsv(text);
          if (rows.length === 0) throw new Error('CSV에서 데이터를 파싱할 수 없습니다.');
          const overrides = await resolvePlayersForNames(rows, file.name);
          await importDailyCsvRows(rows, date, seasonYear, overrides);
          rowCount = rows.length;
        }

        const matchInfo = type === 'match' ? parseMatchFilename(file.name) : type === 'match_session' ? parseMatchSessionFilename(file.name) : null;

        await saveCsvUploadRecord({
          filename: file.name,
          file_type: type,
          file_size: file.size,
          row_count: rowCount,
          training_date: matchInfo?.date ?? date,
          csv_content: text,
        });

        const typeLabel = type === 'match_session' ? '세션별 경기' : type === 'match' ? '경기' : type === 'session' ? '세션' : type === 'physical' ? '피지컬' : type === 'body_composition' ? '체성분' : '일일';
        const dateLabel = matchInfo ? `${matchInfo.date} vs ${matchInfo.opponent}` : date;
        newStatuses[newStatuses.length - 1] = {
          filename: file.name,
          status: 'success',
          message: `${typeLabel} 데이터 ${rowCount}행 · ${dateLabel}`,
        };
      } catch (e) {
        newStatuses[newStatuses.length - 1] = {
          filename: file.name,
          status: 'error',
          message: e instanceof Error ? e.message : (e as any)?.message ?? JSON.stringify(e),
        };
      }
      setStatuses([...newStatuses]);
    }

    await loadData();
  }, [loadData, resolvePlayersForNames, seasonYear]);

  const handleDownload = (record: CsvUploadRecord) => {
    const blob = new Blob([record.csv_content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return;
    setDeleting(id);
    try {
      await deleteCsvUpload(id);
      await loadData();
    } catch {
      // silently fail
    } finally {
      setDeleting(null);
    }
  };

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const lastUpload = uploads.length > 0 ? formatDate(uploads[0].created_at) : '-';

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="w-1 h-6 bg-cyan-400 rounded-sm inline-block" />
        데이터 관리
      </h1>

      {/* CSV 파일 업로드 */}
      <div className="bg-surface rounded-xl p-6 shadow-[var(--shadow-1)] mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-text-secondary flex items-center gap-2">
            📁 CSV 파일 업로드
          </p>
          <label className="text-xs text-text-secondary flex items-center gap-2">
            시즌
            <select
              value={seasonYear}
              onChange={e => setSeasonYear(Number(e.target.value))}
              className="px-2 py-1 text-xs rounded border border-surface-secondary bg-[var(--bg)]"
            >
              {SEASON_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-lg p-16 border-2 border-dashed transition-colors text-center cursor-pointer ${
            dragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-surface-secondary'
          }`}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv';
            input.multiple = true;
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files;
              if (f) handleFiles(f);
            };
            input.click();
          }}
        >
          <div className="text-5xl mb-4 opacity-40">📄</div>
          <p className="text-base font-medium mb-2">클릭하거나 파일을 여기에 드래그하세요</p>
          <p className="text-sm text-text-secondary">CSV 파일 · 여러 파일 동시 업로드 가능</p>
        </div>
      </div>

      {/* 업로드 결과 */}
      {statuses.length > 0 && (
        <div className="bg-surface rounded-xl p-6 shadow-[var(--shadow-1)] mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-text-secondary">업로드 결과</p>
            <button onClick={() => setStatuses([])}
              className="text-xs text-text-disabled hover:text-text-secondary">닫기</button>
          </div>
          <div className="space-y-2">
            {statuses.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm ${
                s.status === 'success' ? 'bg-green-500/10' : s.status === 'error' ? 'bg-red-500/10' : 'bg-cyan-400/10'
              }`}>
                <span>{s.status === 'success' ? '✅' : s.status === 'error' ? '❌' : '⏳'}</span>
                <span className="font-medium truncate">{s.filename}</span>
                {s.message && <span className="text-xs text-text-secondary ml-auto whitespace-nowrap">{s.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 현재 데이터 현황 */}
      <div className="bg-surface rounded-xl p-6 shadow-[var(--shadow-1)] mb-6">
        <p className="text-sm text-text-secondary mb-4">현재 데이터 현황</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[var(--bg)] rounded-lg p-4">
            <p className="text-cyan-400 font-bold text-sm mb-1">데이터 기간</p>
            <p className="text-sm">{summary.dateRange}</p>
          </div>
          <div className="bg-[var(--bg)] rounded-lg p-4">
            <p className="text-cyan-400 font-bold text-sm mb-1">선수 / 세션</p>
            <p className="text-sm">{summary.playerCount}명 / {summary.sessionCount}세션</p>
          </div>
          <div className="bg-[var(--bg)] rounded-lg p-4">
            <p className="text-cyan-400 font-bold text-sm mb-1">마지막 업데이트</p>
            <p className="text-sm">{lastUpload}</p>
          </div>
        </div>
      </div>

      {/* 업로드된 파일 목록 */}
      <div className="bg-surface rounded-xl p-6 shadow-[var(--shadow-1)]">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-text-secondary">업로드된 파일 목록</p>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-xs rounded-md border border-surface-secondary hover:bg-surface-secondary transition-colors"
          >
            🔄 새로고침
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-text-secondary text-center py-8">로딩 중...</p>
        ) : uploads.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-8">업로드된 파일이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {uploads.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-[var(--bg)] transition-colors"
              >
                <span className="text-lg opacity-60">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.filename}</p>
                </div>
                <span className="text-xs text-text-secondary whitespace-nowrap">{formatFileSize(file.file_size)}</span>
                <span className="text-xs text-text-secondary whitespace-nowrap">{formatDate(file.created_at)}</span>
                <button
                  onClick={() => handleDownload(file)}
                  className="px-3 py-1 text-xs rounded border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors whitespace-nowrap"
                >
                  ⬇ 다운로드
                </button>
                <button
                  onClick={() => handleDelete(file.id)}
                  disabled={deleting === file.id}
                  className="px-3 py-1 text-xs rounded border border-red-400 text-red-400 hover:bg-red-400/10 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  ✕ 삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {ambiguousDialog && (
        <AmbiguousNameDialog state={ambiguousDialog} onSubmit={decisions => ambiguousDialog.resolve(decisions)} />
      )}
    </div>
  );
}
