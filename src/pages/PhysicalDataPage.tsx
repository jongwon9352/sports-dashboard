import { useEffect, useState, useMemo } from 'react';
import {
  fetchPhysicalTestRecords, upsertPhysicalTestRecord,
  fetchAllPlayers, type PhysicalTestRow,
} from '../lib/api';
import type { Player } from '../types';

interface FormState {
  player_id: string;
  test_round: string;
  test_date: string;
  nordic_curl_left: string;
  nordic_curl_right: string;
  hip_ab_left: string;
  hip_ab_right: string;
  hip_ad_left: string;
  hip_ad_right: string;
  sprint_5m_time: string;
  sprint_10m_time: string;
  sprint_30m_time: string;
  cmj_height: string;
  rebound_jump_height: string;
  squat_jump_height: string;
  cod_run: string;
  cod_ball: string;
  mas_value: string;
  mss_value: string;
}

const EMPTY_FORM: FormState = {
  player_id: '', test_round: '1', test_date: '',
  nordic_curl_left: '', nordic_curl_right: '',
  hip_ab_left: '', hip_ab_right: '', hip_ad_left: '', hip_ad_right: '',
  sprint_5m_time: '', sprint_10m_time: '', sprint_30m_time: '',
  cmj_height: '', rebound_jump_height: '', squat_jump_height: '',
  cod_run: '', cod_ball: '', mas_value: '', mss_value: '',
};

const FIELD_GROUPS: { title: string; fields: { key: keyof FormState; label: string }[] }[] = [
  { title: 'Strength', fields: [
    { key: 'nordic_curl_left', label: 'Nordic(좌)' }, { key: 'nordic_curl_right', label: 'Nordic(우)' },
    { key: 'hip_ab_left', label: '외전(좌)' }, { key: 'hip_ab_right', label: '외전(우)' },
    { key: 'hip_ad_left', label: '내전(좌)' }, { key: 'hip_ad_right', label: '내전(우)' },
  ]},
  { title: 'Speed', fields: [
    { key: 'sprint_5m_time', label: '5m(s)' }, { key: 'sprint_10m_time', label: '10m(s)' }, { key: 'sprint_30m_time', label: '30m(s)' },
  ]},
  { title: 'Power', fields: [
    { key: 'cmj_height', label: 'CMJ(cm)' }, { key: 'rebound_jump_height', label: '재점프(cm)' }, { key: 'squat_jump_height', label: 'Squat Jump(cm)' },
  ]},
  { title: 'Agility & MAS/MSS', fields: [
    { key: 'cod_run', label: '방향전환(런)' }, { key: 'cod_ball', label: '방향전환(볼)' },
    { key: 'mas_value', label: 'MAS' }, { key: 'mss_value', label: 'MSS' },
  ]},
];

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
      await upsertPhysicalTestRecord({
        player_id: form.player_id,
        test_round: form.test_round,
        test_date: form.test_date,
        nordic_curl_left: num(form.nordic_curl_left),
        nordic_curl_right: num(form.nordic_curl_right),
        hip_ab_left: num(form.hip_ab_left),
        hip_ab_right: num(form.hip_ab_right),
        hip_ad_left: num(form.hip_ad_left),
        hip_ad_right: num(form.hip_ad_right),
        sprint_5m_time: num(form.sprint_5m_time),
        sprint_10m_time: num(form.sprint_10m_time),
        sprint_30m_time: num(form.sprint_30m_time),
        cmj_height: num(form.cmj_height),
        rebound_jump_height: num(form.rebound_jump_height),
        squat_jump_height: num(form.squat_jump_height),
        cod_run: num(form.cod_run),
        cod_ball: num(form.cod_ball),
        mas_value: num(form.mas_value),
        mss_value: num(form.mss_value),
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
      <div className="bg-surface rounded-xl p-6 w-[520px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">피지컬(VALD) 측정 추가/수정</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
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
        </div>

        {FIELD_GROUPS.map(group => (
          <div key={group.title} className="mb-3">
            <p className="text-[11px] text-text-disabled uppercase tracking-[1px] mb-1.5">{group.title}</p>
            <div className="grid grid-cols-3 gap-2">
              {group.fields.map(f => (
                <label key={f.key} className="text-xs text-text-secondary">
                  {f.label}
                  <input
                    type="number" step="0.01"
                    value={form[f.key]}
                    onChange={e => set(f.key, e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

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

export function PhysicalDataPage() {
  const [data, setData] = useState<PhysicalTestRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalForm, setModalForm] = useState<FormState | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchPhysicalTestRecords(), fetchAllPlayers()])
      .then(([m, p]) => { setData(m); setPlayers(p); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return data.filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  const openEdit = (row: PhysicalTestRow) => setModalForm({
    player_id: row.player_id,
    test_round: row.test_round ?? '1',
    test_date: row.test_date,
    nordic_curl_left: row.nordic_curl_left != null ? String(row.nordic_curl_left) : '',
    nordic_curl_right: row.nordic_curl_right != null ? String(row.nordic_curl_right) : '',
    hip_ab_left: row.hip_ab_left != null ? String(row.hip_ab_left) : '',
    hip_ab_right: row.hip_ab_right != null ? String(row.hip_ab_right) : '',
    hip_ad_left: row.hip_ad_left != null ? String(row.hip_ad_left) : '',
    hip_ad_right: row.hip_ad_right != null ? String(row.hip_ad_right) : '',
    sprint_5m_time: row.sprint_5m_time != null ? String(row.sprint_5m_time) : '',
    sprint_10m_time: row.sprint_10m_time != null ? String(row.sprint_10m_time) : '',
    sprint_30m_time: row.sprint_30m_time != null ? String(row.sprint_30m_time) : '',
    cmj_height: row.cmj_height != null ? String(row.cmj_height) : '',
    rebound_jump_height: row.rebound_jump_height != null ? String(row.rebound_jump_height) : '',
    squat_jump_height: row.squat_jump_height != null ? String(row.squat_jump_height) : '',
    cod_run: row.cod_run != null ? String(row.cod_run) : '',
    cod_ball: row.cod_ball != null ? String(row.cod_ball) : '',
    mas_value: row.mas_value != null ? String(row.mas_value) : '',
    mss_value: row.mss_value != null ? String(row.mss_value) : '',
  });

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
          <button
            onClick={() => setModalForm(EMPTY_FORM)}
            className="px-3 py-1.5 text-xs rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors"
          >
            + 측정 추가
          </button>
        </div>
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
                    {['이름', '포지션', '측정일', '회차', 'Nordic(좌)', 'Nordic(우)', '외전(좌)', '외전(우)', '내전(좌)', '내전(우)',
                      '5m(s)', '10m(s)', '30m(s)', 'CMJ(cm)', '재점프(cm)', 'Squat Jump(cm)', '방향전환(런)', '방향전환(볼)', 'MAS', 'MSS', ''].map(h => (
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
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.test_date}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{row.test_round ?? '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.nordic_curl_left)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.nordic_curl_right)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ab_left)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ab_right)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ad_left)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ad_right)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.sprint_5m_time)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.sprint_10m_time)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.sprint_30m_time)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.cmj_height)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.rebound_jump_height)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.squat_jump_height)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.cod_run)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.cod_ball)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.mas_value)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.mss_value)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <button onClick={() => openEdit(row)} className="text-xs text-cyan-400 hover:underline">수정</button>
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
