import { useEffect, useState, useMemo } from 'react';
import { fetchMaturityRecords, updatePlayerMaturityBaseline, type MaturityRow } from '../lib/api';

function fmt(v: number | string | null): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
}

function num(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// 이미 값이 있으면 잠금(읽기 전용), 비어있을 때만 입력 가능 — "처음 넣은 값 고정"
function LockedNumberCell({ value, onSave }: { value: number | null; onSave: (v: number) => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (value != null) {
    return <span className="text-sm">{fmt(value)}</span>;
  }

  const handleBlur = async () => {
    const n = num(draft);
    if (n == null) return;
    setSaving(true);
    try {
      await onSave(n);
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="number" step="0.1"
      value={draft}
      disabled={saving}
      onChange={e => setDraft(e.target.value)}
      onBlur={handleBlur}
      placeholder="입력"
      className="w-16 px-1 py-0.5 text-xs rounded border border-yellow-500/50 bg-[var(--bg)]"
    />
  );
}

function LockedDateCell({ value, onSave }: { value: string | null; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (value != null) {
    return <span className="text-sm">{value}</span>;
  }

  const handleBlur = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="date"
      value={draft}
      disabled={saving}
      onChange={e => setDraft(e.target.value)}
      onBlur={handleBlur}
      className="px-1 py-0.5 text-xs rounded border border-yellow-500/50 bg-[var(--bg)]"
    />
  );
}

export function MaturityDataPage() {
  const [data, setData] = useState<MaturityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    fetchMaturityRecords().then(setData).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return data.filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  const save = async (playerId: string, field: string, value: number | string) => {
    try {
      await updatePlayerMaturityBaseline(playerId, { [field]: value });
      load();
    } catch {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

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
        <input
          type="text"
          placeholder="이름 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400 w-[140px]"
          style={{ fontFamily: 'var(--font-data)' }}
        />
        <p className="text-[11px] text-text-secondary mt-2">
          선수당 최초 1회만 입력 가능하며, 입력 후에는 값이 고정되어 수정할 수 없습니다.
          (노란 테두리 = 미입력 항목, 클릭 후 값 입력 → 포커스 아웃 시 저장)
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
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <LockedDateCell value={row.baseline_measured_at} onSave={v => save(row.player_id, 'baseline_measured_at', v)} />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <LockedNumberCell value={row.baseline_height_cm} onSave={v => save(row.player_id, 'baseline_height_cm', v)} />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <LockedNumberCell value={row.baseline_weight_kg} onSave={v => save(row.player_id, 'baseline_weight_kg', v)} />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <LockedNumberCell value={row.chair_height_cm} onSave={v => save(row.player_id, 'chair_height_cm', v)} />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <LockedNumberCell value={row.baseline_sitting_height_cm} onSave={v => save(row.player_id, 'baseline_sitting_height_cm', v)} />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <LockedNumberCell value={row.mother_height_cm} onSave={v => save(row.player_id, 'mother_height_cm', v)} />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <LockedNumberCell value={row.father_height_cm} onSave={v => save(row.player_id, 'father_height_cm', v)} />
                      </td>
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
