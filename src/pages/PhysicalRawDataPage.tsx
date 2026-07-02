import { useEffect, useState, useMemo } from 'react';
import { fetchPhysicalRawData, type PhysicalRawRow } from '../lib/api';

type ColDef = { key: keyof PhysicalRawRow; label: string };

const COLUMNS: ColDef[] = [
  { key: 'player_name', label: '이름' },
  { key: 'position', label: '포지션' },
  { key: 'test_date', label: '측정일' },
  { key: 'test_round', label: '회차' },
  { key: 'height', label: '신장(cm)' },
  { key: 'weight', label: '체중(kg)' },
  { key: 'age_decimal', label: '만 나이' },
  { key: 'mirwald_maturity_offset', label: 'PHV Offset' },
  { key: 'mirwald_aphv_age', label: 'APHV' },
  { key: 'maturity_stage', label: '성숙 단계' },
  { key: 'predicted_adult_height_cm', label: 'Khamis-Roche 예측키(cm)' },
  { key: 'pah_percent', label: '%PAH' },
  { key: 'maturity_zscore', label: 'Maturity Z-score' },
  { key: 'nordic_curl_left', label: 'Nordic(좌)' },
  { key: 'nordic_curl_right', label: 'Nordic(우)' },
  { key: 'hip_ab_left', label: '외전(좌)' },
  { key: 'hip_ab_right', label: '외전(우)' },
  { key: 'hip_ad_left', label: '내전(좌)' },
  { key: 'hip_ad_right', label: '내전(우)' },
  { key: 'sprint_5m_time', label: '5m(s)' },
  { key: 'sprint_10m_time', label: '10m(s)' },
  { key: 'sprint_30m_time', label: '30m(s)' },
  { key: 'cmj_height', label: 'CMJ(cm)' },
  { key: 'squat_jump_height', label: 'Squat Jump(cm)' },
  { key: 'cod_run', label: '방향전환(런)' },
  { key: 'cod_ball', label: '방향전환(볼)' },
  { key: 'mas_value', label: 'MAS' },
  { key: 'mss_value', label: 'MSS' },
];

export function PhysicalRawDataPage() {
  const [data, setData] = useState<PhysicalRawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPhysicalRawData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return data.filter(row =>
      !search || row.player_name.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  const fmt = (v: number | string | null): string => {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-72px)]">
      <div className="p-6 pb-4 flex-shrink-0">
        <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-400 rounded-sm inline-block" />
          피지컬 데이터
          <span className="text-sm font-normal text-text-secondary ml-2" style={{ fontFamily: 'var(--font-data)' }}>
            ({filtered.length}건)
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
        </div>
        <p className="text-[11px] text-text-secondary mt-2">
          PHV Offset·APHV는 Mirwald 공식, Khamis-Roche 예측키는 부모 신장 입력 시에만 계산됩니다.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6">
        {loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-16">
            데이터가 없습니다. physical_report 테이블에 측정 데이터를 입력하세요.
          </p>
        ) : (
          <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)', minWidth: 'max-content' }}>
                <thead>
                  <tr className="border-b border-surface-secondary">
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
                  {filtered.map(row => (
                    <tr
                      key={row.id}
                      className="border-b border-surface-secondary/50 hover:bg-surface-secondary/30 transition-colors"
                    >
                      {COLUMNS.map(col => (
                        <td key={col.key} className="px-2.5 py-2 whitespace-nowrap">
                          {col.key === 'player_name'
                            ? <span className="font-medium">{row.player_name}</span>
                            : fmt(row[col.key])}
                        </td>
                      ))}
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
