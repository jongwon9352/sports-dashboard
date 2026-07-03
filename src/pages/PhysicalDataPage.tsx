import { useEffect, useState, useMemo } from 'react';
import {
  fetchPhysicalTestRecords, upsertPhysicalTestRecord, fetchAllPlayers,
  fetchBodyCompositionRecords, fetchSpeedCustomRecords,
  fetchMaturityRecords, syncMaturityFromGoogleSheet,
  type PhysicalTestRow, type BodyCompositionRow, type SpeedCustomRow, type MaturityRow,
} from '../lib/api';
import type { Player } from '../types';

type Tab = 'vald' | 'body' | 'speed' | 'maturity';

function fmt(v: number | string | null): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
}

// ── VALD 탭 ──────────────────────────────────────────────────────────────
interface ValdFormState {
  player_id: string;
  test_date: string;
  height: string;
  weight: string;
  cmj_height: string;
  squat_jump_height: string;
  nordic_curl_left: string;
  nordic_curl_right: string;
  ham_iso_left: string;
  ham_iso_right: string;
  hip_ad_left: string;
  hip_ad_right: string;
  hip_ab_left: string;
  hip_ab_right: string;
  sprint_5m_time: string;
  sprint_10m_time: string;
  sprint_30m_time: string;
  cod_run: string;
  cod_ball: string;
}

const EMPTY_VALD_FORM: ValdFormState = {
  player_id: '', test_date: '', height: '', weight: '',
  cmj_height: '', squat_jump_height: '',
  nordic_curl_left: '', nordic_curl_right: '', ham_iso_left: '', ham_iso_right: '',
  hip_ad_left: '', hip_ad_right: '', hip_ab_left: '', hip_ab_right: '',
  sprint_5m_time: '', sprint_10m_time: '', sprint_30m_time: '',
  cod_run: '', cod_ball: '',
};

const VALD_FIELD_GROUPS: { title: string; fields: { key: keyof ValdFormState; label: string }[] }[] = [
  { title: '체성분', fields: [
    { key: 'height', label: '키(cm)' }, { key: 'weight', label: '체중(kg)' },
  ]},
  { title: 'Power (ForceDecks)', fields: [
    { key: 'cmj_height', label: 'CMJ' }, { key: 'squat_jump_height', label: 'SJ' },
  ]},
  { title: 'Strength (NordBord / ForceFrame)', fields: [
    { key: 'nordic_curl_left', label: 'HAM ECC(L)' }, { key: 'nordic_curl_right', label: 'HAM ECC(R)' },
    { key: 'ham_iso_left', label: 'HAM ISO(L)' }, { key: 'ham_iso_right', label: 'HAM ISO(R)' },
    { key: 'hip_ad_left', label: 'HIP ADD(L)' }, { key: 'hip_ad_right', label: 'HIP ADD(R)' },
    { key: 'hip_ab_left', label: 'HIP ABD(L)' }, { key: 'hip_ab_right', label: 'HIP ABD(R)' },
  ]},
  { title: 'Speed (SmartSpeed)', fields: [
    { key: 'sprint_5m_time', label: '5M' }, { key: 'sprint_10m_time', label: '10M' }, { key: 'sprint_30m_time', label: '30M' },
    { key: 'cod_run', label: 'COD' }, { key: 'cod_ball', label: 'COD(BALL)' },
  ]},
];

function num(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function ValdModal({ players, initial, onClose, onSaved }: {
  players: Player[];
  initial: ValdFormState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ValdFormState>(initial);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof ValdFormState, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.player_id || !form.test_date) {
      alert('선수, 측정일은 필수입니다.');
      return;
    }
    setSaving(true);
    try {
      await upsertPhysicalTestRecord({
        player_id: form.player_id,
        test_date: form.test_date,
        height: num(form.height),
        weight: num(form.weight),
        cmj_height: num(form.cmj_height),
        squat_jump_height: num(form.squat_jump_height),
        nordic_curl_left: num(form.nordic_curl_left),
        nordic_curl_right: num(form.nordic_curl_right),
        ham_iso_left: num(form.ham_iso_left),
        ham_iso_right: num(form.ham_iso_right),
        hip_ad_left: num(form.hip_ad_left),
        hip_ad_right: num(form.hip_ad_right),
        hip_ab_left: num(form.hip_ab_left),
        hip_ab_right: num(form.hip_ab_right),
        sprint_5m_time: num(form.sprint_5m_time),
        sprint_10m_time: num(form.sprint_10m_time),
        sprint_30m_time: num(form.sprint_30m_time),
        cod_run: num(form.cod_run),
        cod_ball: num(form.cod_ball),
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
        <h2 className="text-lg font-bold mb-4">VALD 측정 추가/수정</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="col-span-2 text-xs text-text-secondary">
            선수
            <select value={form.player_id} onChange={e => set('player_id', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]">
              <option value="">선택</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.position})</option>)}
            </select>
          </label>
          <label className="col-span-2 text-xs text-text-secondary">
            측정일
            <input type="date" value={form.test_date} onChange={e => set('test_date', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]" />
          </label>
        </div>

        {VALD_FIELD_GROUPS.map(group => (
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

function ValdTab() {
  const [data, setData] = useState<PhysicalTestRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRound, setSelectedRound] = useState('전체');
  const [modalForm, setModalForm] = useState<ValdFormState | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchPhysicalTestRecords(), fetchAllPlayers()])
      .then(([m, p]) => { setData(m); setPlayers(p); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // 회차(test_round) 목록: 최신순, "전체" 포함
  const roundOptions = useMemo(() => {
    const rounds = [...new Set(data.map(r => r.test_round).filter((r): r is string => r != null))];
    rounds.sort((a, b) => b.localeCompare(a));
    return ['전체', ...rounds];
  }, [data]);

  const filtered = useMemo(() => {
    return data
      .filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()))
      .filter(row => selectedRound === '전체' || row.test_round === selectedRound)
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search, selectedRound]);

  const openEdit = (row: PhysicalTestRow) => setModalForm({
    player_id: row.player_id,
    test_date: row.test_date,
    height: row.height != null ? String(row.height) : '',
    weight: row.weight != null ? String(row.weight) : '',
    cmj_height: row.cmj_height != null ? String(row.cmj_height) : '',
    squat_jump_height: row.squat_jump_height != null ? String(row.squat_jump_height) : '',
    nordic_curl_left: row.nordic_curl_left != null ? String(row.nordic_curl_left) : '',
    nordic_curl_right: row.nordic_curl_right != null ? String(row.nordic_curl_right) : '',
    ham_iso_left: row.ham_iso_left != null ? String(row.ham_iso_left) : '',
    ham_iso_right: row.ham_iso_right != null ? String(row.ham_iso_right) : '',
    hip_ad_left: row.hip_ad_left != null ? String(row.hip_ad_left) : '',
    hip_ad_right: row.hip_ad_right != null ? String(row.hip_ad_right) : '',
    hip_ab_left: row.hip_ab_left != null ? String(row.hip_ab_left) : '',
    hip_ab_right: row.hip_ab_right != null ? String(row.hip_ab_right) : '',
    sprint_5m_time: row.sprint_5m_time != null ? String(row.sprint_5m_time) : '',
    sprint_10m_time: row.sprint_10m_time != null ? String(row.sprint_10m_time) : '',
    sprint_30m_time: row.sprint_30m_time != null ? String(row.sprint_30m_time) : '',
    cod_run: row.cod_run != null ? String(row.cod_run) : '',
    cod_ball: row.cod_ball != null ? String(row.cod_ball) : '',
  });

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <input
          type="text"
          placeholder="이름 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400 w-[140px]"
          style={{ fontFamily: 'var(--font-data)' }}
        />
        <select
          value={selectedRound}
          onChange={e => setSelectedRound(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400"
        >
          {roundOptions.map(r => <option key={r} value={r}>{r === '전체' ? '전체' : `${r}차`}</option>)}
        </select>
        <button
          onClick={() => setModalForm(EMPTY_VALD_FORM)}
          className="px-3 py-1.5 text-xs rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors"
        >
          + 측정 추가
        </button>
      </div>
      <p className="text-[11px] text-text-secondary mb-3">
        측정일마다 새 기록이 누적됩니다. 데이터 관리 &gt; 업로드에서 ForceDecks/NordBord/ForceFrame/SmartSpeed CSV를 올리면 자동으로 반영됩니다.
      </p>

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
                  {['TEST_ID', '이름', '포지션', '측정일', '키', '체중', 'CMJ', 'SJ',
                    'HAM ECC(L)', 'HAM ECC(R)', 'HAM ISO(L)', 'HAM ISO(R)',
                    'HIP ADD(L)', 'HIP ADD(R)', 'HIP ABD(L)', 'HIP ABD(R)',
                    '5M', '10M', '30M', 'COD', 'COD(BALL)', ''].map(h => (
                    <th key={h} className="px-2.5 py-2.5 text-left text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} className="border-b border-surface-secondary/50 hover:bg-surface-secondary/30 transition-colors">
                    <td className="px-2.5 py-2 whitespace-nowrap font-medium text-cyan-400">{row.test_round ?? '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap font-medium">{row.player_name}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.position ?? '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.test_date}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.height)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.weight)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.cmj_height)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.squat_jump_height)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.nordic_curl_left)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.nordic_curl_right)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.ham_iso_left)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.ham_iso_right)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ad_left)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ad_right)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ab_left)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.hip_ab_right)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.sprint_5m_time)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.sprint_10m_time)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.sprint_30m_time)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.cod_run)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.cod_ball)}</td>
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

      {modalForm && (
        <ValdModal players={players} initial={modalForm} onClose={() => setModalForm(null)} onSaved={load} />
      )}
    </>
  );
}

// ── Body composition 탭 ────────────────────────────────────────────────
function BodyCompositionTab() {
  const [data, setData] = useState<BodyCompositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchBodyCompositionRecords().then(setData).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return data.filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  return (
    <>
      <input
        type="text"
        placeholder="이름 검색..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400 w-[140px] mb-2"
        style={{ fontFamily: 'var(--font-data)' }}
      />
      <p className="text-[11px] text-text-secondary mb-3">
        선수당 월 1건씩 누적됩니다. 데이터 관리 &gt; 업로드에서 "체성분/body" 포함 파일명의 CSV를 올리면 자동으로 반영됩니다.
      </p>

      {loading ? (
        <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-16">데이터가 없습니다. CSV 업로드로 채워주세요.</p>
      ) : (
        <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)', minWidth: 'max-content' }}>
              <thead>
                <tr className="border-b border-surface-secondary">
                  {['이름', '포지션', '연도', '월', '신장(cm)', '체중(kg)'].map(h => (
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
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.year}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.month}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.height)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Speed custom 탭 ────────────────────────────────────────────────────
function SpeedCustomTab() {
  const [data, setData] = useState<SpeedCustomRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSpeedCustomRecords().then(setData).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <p className="text-[11px] text-text-secondary mb-3">
        Speed custom 측정 항목은 CSV 형식이 확정되면 추가됩니다. 현재는 선수·측정일만 저장되는 골격 구조입니다.
      </p>

      {loading ? (
        <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-16">데이터가 없습니다. CSV 형식 확정 후 업로드 기능이 연결됩니다.</p>
      ) : (
        <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
          <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)' }}>
            <thead>
              <tr className="border-b border-surface-secondary">
                {['이름', '포지션', '측정일'].map(h => (
                  <th key={h} className="px-2.5 py-2.5 text-left text-[11px] text-text-secondary font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id} className="border-b border-surface-secondary/50">
                  <td className="px-2.5 py-2 whitespace-nowrap font-medium">{row.player_name}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{row.position ?? '—'}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{row.test_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── 신체 성숙도 탭 ──────────────────────────────────────────────────────
function maturityFmt(v: number | string | null): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
}

function MaturityTab() {
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

  useEffect(() => {
    load();
    runSync(true);
  }, []);

  const filtered = useMemo(() => {
    return data.filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-2">
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
      <p className="text-[11px] text-text-secondary mb-3">
        이 값들은 구글 시트(신체 성숙도 응답 폼)에서만 채워지며, 화면에서 직접 수정할 수 없습니다.
        시트에 새 응답이 올라오면 탭 진입 시 자동으로 반영됩니다.
      </p>

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
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.baseline_height_cm)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.baseline_weight_kg)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.chair_height_cm)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.baseline_sitting_height_cm)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.mother_height_cm)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.father_height_cm)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.age_decimal)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.mirwald_maturity_offset)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.mirwald_aphv_age)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.maturity_stage ?? '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.predicted_adult_height_cm)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.pah_percent)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{maturityFmt(row.maturity_zscore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────
export function PhysicalDataPage() {
  const [tab, setTab] = useState<Tab>('vald');

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 text-sm rounded border transition-colors ${
        tab === id ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-72px)]">
      <div className="p-6 pb-4 flex-shrink-0">
        <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-400 rounded-sm inline-block" />
          피지컬 데이터
        </h1>
        <div className="flex gap-2">
          {tabBtn('vald', 'VALD')}
          {tabBtn('body', 'Body composition')}
          {tabBtn('speed', 'Speed custom')}
          {tabBtn('maturity', '신체 성숙도')}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {tab === 'vald' && <ValdTab />}
        {tab === 'body' && <BodyCompositionTab />}
        {tab === 'speed' && <SpeedCustomTab />}
        {tab === 'maturity' && <MaturityTab />}
      </div>
    </div>
  );
}
