import { useEffect, useState, useMemo } from 'react';
import { fetchMaturityRecords, syncMaturityFromGoogleSheet, type MaturityRow } from '../lib/api';

function fmt(v: number | string | null): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
}

export function MaturityDataPage() {
  const [data, setData] = useState<MaturityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState('');

  const load = () => {
    setLoading(true);
    fetchMaturityRecords().then(setData).finally(() => setLoading(false));
  };

  const runSync = async (silent: boolean) => {
    setSyncing(true);
    try {
      const result = await syncMaturityFromGoogleSheet();
      load();
      const msg = result.unmatchedNames.length > 0
        ? `${result.updatedCount}명 반영 (매칭 안 됨: ${result.unmatchedNames.join(', ')})`
        : `${result.updatedCount}명 반영`;
      setLastSyncMsg(msg);
      if (!silent) alert(msg);
    } catch {
      setLastSyncMsg('동기화 실패');
      if (!silent) alert('구글 시트 동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  // 페이지 진입 시 구글 시트에서 자동 동기화
  useEffect(() => {
    load();
    runSync(true);
  }, []);

  const filtered = useMemo(() => {
    return data.filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  return (
    <div className="flex flex-col h-[calc(100vh-72px)]">
      <div className="p-6 pb-4 flex-shrink-0">
        <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-400 rounded-sm inline-block" />
          신체 성숙도
          <span className="text-sm font-normal text-text-secondary ml-2" style={{ fontFamily: 'var(--font-data)' }}>
            ({filtered.length}명)
          </span>
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="이름 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400 w-[140px]"
            style={{ fontFamily: 'var(--font-data)' }}
          />
          <button
            onClick={() => runSync(false)}
            disabled={syncing}
            className="px-3 py-1.5 text-xs rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-50"
          >
            {syncing ? '동기화 중...' : '지금 다시 동기화'}
          </button>
          {lastSyncMsg && <span className="text-[11px] text-text-secondary">{lastSyncMsg}</span>}
        </div>
        <p className="text-[11px] text-text-secondary mt-2">
          이 값들은 구글 시트(신체 성숙도 응답 폼)에서만 채워지며, 화면에서 직접 수정할 수 없습니다.
          시트에 새 응답이 올라오면 페이지 진입 시 자동으로 반영됩니다.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-16">선수가 없습니다.</p>
        ) : (
          <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)', minWidth: 'max-content' }}>
                <thead>
                  <tr className="border-b border-surface-secondary">
                    {['선수 이름', '포지션', '측정일', '선수 신장(cm)', '선수 몸무게(kg)', '의자 높이(cm)', '앉은 키(cm)',
                      '엄마 신장(cm)', '아빠 신장(cm)', '만 나이', 'PHV Offset', 'APHV', '성숙 단계',
                      'Khamis-Roche 예측키(cm)', '%PAH', 'Z-score'].map(h => (
                      <th key={h} className="px-2.5 py-2.5 text-left text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.player_id} className="border-b border-surface-secondary/50 hover:bg-surface-secondary/30 transition-colors">
                      <td className="px-2.5 py-2 whitespace-nowrap font-medium">{row.player_name}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.position ?? '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.baseline_measured_at ?? '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.baseline_height_cm)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.baseline_weight_kg)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.chair_height_cm)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.baseline_sitting_height_cm)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.mother_height_cm)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.father_height_cm)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.age_decimal)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.mirwald_maturity_offset)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.mirwald_aphv_age)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.maturity_stage ?? '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.predicted_adult_height_cm)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.pah_percent)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.maturity_zscore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
