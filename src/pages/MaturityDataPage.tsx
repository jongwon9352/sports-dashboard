import { useEffect, useState, useMemo } from 'react';
import {
  fetchMaturityRecords, upsertMaturityRecord, updatePlayerParentHeight,
  fetchAllPlayers, type MaturityRow,
} from '../lib/api';
import type { Player } from '../types';

interface FormState {
  player_id: string;
  test_round: string;
  test_date: string;
  height: string;
  weight: string;
  leg_length: string;
  sitting_height: string;
}

const EMPTY_FORM: FormState = {
  player_id: '', test_round: '1', test_date: '',
  height: '', weight: '', leg_length: '', sitting_height: '',
};

function num(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: number | string | null): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
}

function RecordModal({ players, initial, onClose, onSaved }: {
  players: Player[];
  initial: FormState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof FormState, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.player_id || !form.test_round || !form.test_date) {
      alert('선수, 회차, 측정일은 필수입니다.');
      return;
    }
    setSaving(true);
    try {
      await upsertMaturityRecord({
        player_id: form.player_id,
        test_round: form.test_round,
        test_date: form.test_date,
        height: num(form.height),
        weight: num(form.weight),
        leg_length: num(form.leg_length),
        sitting_height: num(form.sitting_height),
      });
      onSaved();
      onClose();
    } catch {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl p-6 w-[420px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">신체 성숙도 측정 추가/수정</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs text-text-secondary">
            선수
            <select value={form.player_id} onChange={e => set('player_id', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]">
              <option value="">선택</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.position})</option>)}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            회차
            <input value={form.test_round} onChange={e => set('test_round', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]" />
          </label>
          <label className="text-xs text-text-secondary">
            측정일
            <input type="date" value={form.test_date} onChange={e => set('test_date', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]" />
          </label>
          <label className="text-xs text-text-secondary">
            신장 (cm)
            <input type="number" step="0.1" value={form.height} onChange={e => set('height', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]" />
          </label>
          <label className="text-xs text-text-secondary">
            체중 (kg)
            <input type="number" step="0.1" value={form.weight} onChange={e => set('weight', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]" />
          </label>
          <label className="text-xs text-text-secondary">
            다리길이 (cm)
            <input type="number" step="0.1" value={form.leg_length} onChange={e => set('leg_length', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]" />
          </label>
          <label className="text-xs text-text-secondary">
            앉은키 (cm)
            <input type="number" step="0.1" value={form.sitting_height} onChange={e => set('sitting_height', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-surface-secondary">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 text-sm rounded bg-purple text-white disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MaturityDataPage() {
  const [data, setData] = useState<MaturityRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalForm, setModalForm] = useState<FormState | null>(null);
  const [savingParent, setSavingParent] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchMaturityRecords(), fetchAllPlayers()])
      .then(([m, p]) => { setData(m); setPlayers(p); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return data.filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  const handleParentHeightBlur = async (row: MaturityRow, field: 'mother_height_cm' | 'father_height_cm', value: string) => {
    const n = num(value);
    setSavingParent(row.player_id);
    try {
      await updatePlayerParentHeight(
        row.player_id,
        field === 'mother_height_cm' ? n : row.mother_height_cm,
        field === 'father_height_cm' ? n : row.father_height_cm,
      );
      load();
    } catch {
      alert('부모 신장 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingParent(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-72px)]">
      <div className="p-6 pb-4 flex-shrink-0">
        <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-400 rounded-sm inline-block" />
          신체 성숙도
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
          <button
            onClick={() => setModalForm(EMPTY_FORM)}
            className="px-3 py-1.5 text-xs rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors"
          >
            + 측정 추가
          </button>
        </div>
        <p className="text-[11px] text-text-secondary mt-2">
          부모 신장은 이름 옆 칸에서 바로 입력 가능합니다. 입력 시 Khamis-Roche 예측키가 자동 계산됩니다.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-16">데이터가 없습니다. 측정 추가 버튼으로 입력하세요.</p>
        ) : (
          <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)', minWidth: 'max-content' }}>
                <thead>
                  <tr className="border-b border-surface-secondary">
                    {['이름', '포지션', '엄마 신장', '아빠 신장', '측정일', '회차', '신장(cm)', '체중(kg)', '만 나이',
                      'PHV Offset', 'APHV', '성숙 단계', 'Khamis-Roche 예측키(cm)', '%PAH', 'Z-score', ''].map(h => (
                      <th key={h} className="px-2.5 py-2.5 text-left text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.id} className="border-b border-surface-secondary/50 hover:bg-surface-secondary/30 transition-colors">
                      <td className="px-2.5 py-2 whitespace-nowrap font-medium">{row.player_name}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.position ?? '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <input
                          type="number" step="0.1" defaultValue={row.mother_height_cm ?? ''}
                          placeholder="cm"
                          disabled={savingParent === row.player_id}
                          onBlur={e => handleParentHeightBlur(row, 'mother_height_cm', e.target.value)}
                          className="w-16 px-1 py-0.5 text-xs rounded border border-surface-secondary bg-[var(--bg)]"
                        />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <input
                          type="number" step="0.1" defaultValue={row.father_height_cm ?? ''}
                          placeholder="cm"
                          disabled={savingParent === row.player_id}
                          onBlur={e => handleParentHeightBlur(row, 'father_height_cm', e.target.value)}
                          className="w-16 px-1 py-0.5 text-xs rounded border border-surface-secondary bg-[var(--bg)]"
                        />
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.test_date}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.test_round ?? '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.height)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.weight)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.age_decimal)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.mirwald_maturity_offset)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.mirwald_aphv_age)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.maturity_stage ?? '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.predicted_adult_height_cm)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.pah_percent)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.maturity_zscore)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <button
                          onClick={() => setModalForm({
                            player_id: row.player_id,
                            test_round: row.test_round ?? '1',
                            test_date: row.test_date,
                            height: row.height != null ? String(row.height) : '',
                            weight: row.weight != null ? String(row.weight) : '',
                            leg_length: row.leg_length != null ? String(row.leg_length) : '',
                            sitting_height: row.sitting_height != null ? String(row.sitting_height) : '',
                          })}
                          className="text-xs text-cyan-400 hover:underline"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {modalForm && (
        <RecordModal
          players={players}
          initial={modalForm}
          onClose={() => setModalForm(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
