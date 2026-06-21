import { useState, useCallback, type DragEvent } from 'react';
import { parseSessionCsv, parseDailyCsv, extractDateFromFilename } from '../utils/csvParser';
import { importDailyCsvRows, importSessionCsvRows } from '../lib/api';

type FileType = 'session' | 'daily' | null;

function detectFileType(filename: string): FileType {
  const normalized = filename.normalize('NFC').toLowerCase();
  if (normalized.includes('리포트') || normalized.includes('report') || normalized.includes('테이블')) return 'session';
  if (normalized.includes('운동부하') || normalized.includes('모니터링') || normalized.includes('workload')) return 'daily';
  return null;
}

interface UploadResult {
  filename: string;
  type: FileType;
  rowCount: number;
  date: string;
  status: 'success' | 'error';
  message?: string;
}

export function Upload() {
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [dateOverride, setDateOverride] = useState('');

  const handleFiles = useCallback(async (files: FileList) => {
    const newResults: UploadResult[] = [];

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.csv')) {
        newResults.push({
          filename: file.name,
          type: null,
          rowCount: 0,
          date: '',
          status: 'error',
          message: 'CSV 파일만 업로드 가능합니다.',
        });
        continue;
      }

      const type = detectFileType(file.name);
      const date = dateOverride || extractDateFromFilename(file.name);
      const text = await file.text();

      try {
        if (type === 'session') {
          const rows = parseSessionCsv(text);
          await importSessionCsvRows(rows, date);
          newResults.push({ filename: file.name, type, rowCount: rows.length, date, status: 'success' });
        } else if (type === 'daily') {
          const rows = parseDailyCsv(text);
          await importDailyCsvRows(rows, date);
          newResults.push({ filename: file.name, type, rowCount: rows.length, date, status: 'success' });
        } else {
          newResults.push({
            filename: file.name,
            type: null,
            rowCount: 0,
            date,
            status: 'error',
            message: '파일 유형을 인식할 수 없습니다. 파일명에 "리포트" 또는 "운동부하"가 포함되어야 합니다.',
          });
        }
      } catch (e) {
        newResults.push({
          filename: file.name,
          type,
          rowCount: 0,
          date,
          status: 'error',
          message: `업로드 오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
        });
      }
    }

    setResults(prev => [...newResults, ...prev]);
  }, [dateOverride]);

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="p-8 max-w-[900px] mx-auto">
      <h1 className="text-[28px] font-semibold mb-6">데이터 업로드</h1>

      <div className="bg-surface rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-1)] mb-6">
        <label className="block text-sm font-medium mb-2">훈련 날짜</label>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateOverride}
            onChange={e => setDateOverride(e.target.value)}
            className="px-3 py-2 border border-surface-secondary rounded-[var(--radius-sm)] text-sm"
          />
          <span className="text-sm text-text-secondary">
            비워두면 파일명에서 자동 추출됩니다
          </span>
        </div>
      </div>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`bg-surface rounded-[var(--radius-card)] p-12 shadow-[var(--shadow-1)] border-2 border-dashed transition-colors text-center cursor-pointer ${
          dragging ? 'border-purple bg-purple-light/30' : 'border-surface-secondary'
        }`}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.csv';
          input.multiple = true;
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) handleFiles(files);
          };
          input.click();
        }}
      >
        <div className="text-5xl mb-4">📁</div>
        <p className="text-lg font-medium mb-2">CSV 파일을 드래그하거나 클릭하세요</p>
        <p className="text-sm text-text-secondary">
          "리포트용 테이블" CSV와 "운동부하 모니터링" CSV를 함께 업로드할 수 있습니다
        </p>
      </div>

      {results.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold">업로드 결과</h2>
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 p-4 rounded-[var(--radius-sm)] ${
                r.status === 'success' ? 'bg-green-light' : 'bg-red-50'
              }`}
            >
              <span className="text-xl">{r.status === 'success' ? '✅' : '❌'}</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{r.filename}</p>
                {r.status === 'success' ? (
                  <p className="text-xs text-text-secondary">
                    {r.type === 'session' ? '세션 데이터' : '일일 데이터'} · {r.rowCount}행 · {r.date}
                  </p>
                ) : (
                  <p className="text-xs text-load-high">{r.message}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
