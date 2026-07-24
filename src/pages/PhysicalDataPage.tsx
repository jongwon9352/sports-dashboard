import { useEffect, useState, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  fetchPhysicalTestRecords, upsertPhysicalTestRecord, fetchAllPlayers,
  fetchBodyCompositionRecords, syncBodyCompositionFromGoogleSheet, fetchSpeedCustomRecords, updateSpeedCustomOverride,
  fetchMaturityRecords, syncMaturityFromGoogleSheet, clearMaturityData,
  fetchKhamisRocheCoefficients, fetchValdThresholds, upsertValdThresholds, computeValdValue,
  VALD_METRIC_DEFS, VALD_GRADES,
  type PhysicalTestRow, type BodyCompositionRow, type SpeedCustomRow, type MaturityRow,
  type KhamisRocheCoefficient, type ValdThreshold,
} from '../lib/api';
import type { Player } from '../types';
import { colors, chartColors } from '../styles/colors';

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
  cmj_peak_force: string;
  squat_jump_peak_force: string;
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
  cmj_height: '', squat_jump_height: '', cmj_peak_force: '', squat_jump_peak_force: '',
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
    { key: 'cmj_peak_force', label: 'CMJ Peak Force' }, { key: 'squat_jump_peak_force', label: 'SJ Peak Force' },
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
        cmj_peak_force: num(form.cmj_peak_force),
        squat_jump_peak_force: num(form.squat_jump_peak_force),
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

function ValdThresholdEditor({ records, players }: { records: PhysicalTestRow[]; players: Player[] }) {
  const [thresholds, setThresholds] = useState<ValdThreshold[]>([]);
  const [metricKey, setMetricKey] = useState(VALD_METRIC_DEFS[0].key);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [form, setForm] = useState<Record<string, { max: string; avg: string; min: string }>>({});

  const load = () => {
    setLoading(true);
    fetchValdThresholds().then(setThresholds).finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    const next: Record<string, { max: string; avg: string; min: string }> = {};
    for (const grade of VALD_GRADES) {
      const t = thresholds.find(x => x.metric_key === metricKey && x.grade === grade);
      next[grade] = {
        max: t?.max_value != null ? String(t.max_value) : '',
        avg: t?.avg_value != null ? String(t.avg_value) : '',
        min: t?.min_value != null ? String(t.min_value) : '',
      };
    }
    setForm(next);
  }, [metricKey, thresholds]);

  const setField = (grade: string, field: 'max' | 'avg' | 'min', value: string) =>
    setForm(prev => ({ ...prev, [grade]: { ...prev[grade], [field]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows: ValdThreshold[] = VALD_GRADES.map(grade => ({
        metric_key: metricKey,
        grade,
        max_value: num(form[grade]?.max ?? ''),
        avg_value: num(form[grade]?.avg ?? ''),
        min_value: num(form[grade]?.min ?? ''),
      }));
      await upsertValdThresholds(rows);
      load();
    } catch {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 팀 실측 데이터(선수별 최신 측정 기록)의 최대/평균/최저를 학년별로 계산해 자동 채우기
  const handleAutofill = async () => {
    setAutofilling(true);
    try {
      const latestByPlayer = new Map<string, PhysicalTestRow>();
      for (const r of records) {
        const prev = latestByPlayer.get(r.player_id);
        if (!prev || r.test_date > prev.test_date) latestByPlayer.set(r.player_id, r);
      }
      const gradeMap = new Map(players.map(p => [p.id, p.grade as string]));
      const rows: ValdThreshold[] = VALD_GRADES.map(grade => {
        const values = players
          .filter(p => grade === '전체' || gradeMap.get(p.id) === grade)
          .map(p => latestByPlayer.get(p.id))
          .filter((r): r is PhysicalTestRow => r != null)
          .map(r => computeValdValue(metricKey, r))
          .filter((v): v is number => v != null);
        if (values.length === 0) return { metric_key: metricKey, grade, max_value: null, avg_value: null, min_value: null };
        return {
          metric_key: metricKey,
          grade,
          max_value: +Math.max(...values).toFixed(2),
          avg_value: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
          min_value: +Math.min(...values).toFixed(2),
        };
      });
      await upsertValdThresholds(rows);
      load();
    } catch {
      alert('자동 채우기 중 오류가 발생했습니다.');
    } finally {
      setAutofilling(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-surface-secondary p-4 mb-4">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-bold">VALD 항목별 학년 임계값</h2>
        <select value={metricKey} onChange={e => setMetricKey(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border border-surface-secondary bg-[var(--bg)]">
          {VALD_METRIC_DEFS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button onClick={handleAutofill} disabled={autofilling}
          className="px-3 py-1.5 text-xs rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-50">
          {autofilling ? '계산 중...' : '팀 데이터로 자동 채우기'}
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-text-secondary text-center py-8">로딩 중...</p>
      ) : (
        <>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-surface-secondary)' }}>
                {['학년', '최대', '평균', '최저'].map(h => (
                  <th key={h} className="py-1.5 px-2 text-left text-text-secondary font-semibold text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VALD_GRADES.map(grade => (
                <tr key={grade} style={{ borderBottom: '1px solid var(--color-surface-secondary)' }}>
                  <td className="py-1.5 px-2 font-medium">{grade}</td>
                  {(['max', 'avg', 'min'] as const).map(field => (
                    <td key={field} className="py-1.5 px-2">
                      <input
                        type="number" step="0.01"
                        value={form[grade]?.[field] ?? ''}
                        onChange={e => setField(grade, field, e.target.value)}
                        className="w-24 px-2 py-1 text-sm rounded border border-surface-secondary bg-[var(--bg)]"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-3">
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 text-sm rounded bg-purple text-white disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </>
      )}
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
  const [showThresholds, setShowThresholds] = useState(false);

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
    cmj_peak_force: row.cmj_peak_force != null ? String(row.cmj_peak_force) : '',
    squat_jump_peak_force: row.squat_jump_peak_force != null ? String(row.squat_jump_peak_force) : '',
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
        <button
          onClick={() => setShowThresholds(v => !v)}
          className="px-3 py-1.5 text-xs rounded-md border border-surface-secondary hover:bg-surface-secondary transition-colors"
        >
          {showThresholds ? '▲ 임계값 설정 숨기기' : '▼ 임계값 설정'}
        </button>
      </div>
      {showThresholds && <ValdThresholdEditor records={data} players={players} />}
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
                  {['TEST_ID', '이름', '포지션', '측정일', '키', '체중', 'CMJ', 'SJ', 'CMJ Peak Force', 'SJ Peak Force',
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
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.cmj_peak_force)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmt(row.squat_jump_peak_force)}</td>
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
function bodyBmi(height: number | null, weight: number | null): number | null {
  if (height == null || weight == null || height <= 0) return null;
  return +(weight / ((height / 100) ** 2)).toFixed(1);
}

// BMI가 10 미만/45 초과면 구글 시트 자유 형식 파싱이 잘못됐을 가능성이 높은 이상치로 간주
function isBmiOutlier(bmi: number | null): boolean {
  return bmi != null && (bmi < 10 || bmi > 45);
}

function BodyStat({ label, unit, digits, cur, prev }: {
  label: string; unit: string; digits: number;
  cur: { avg: number; n: number } | null; prev: { avg: number } | null;
}) {
  if (!cur) return null;
  const delta = prev ? +(cur.avg - prev.avg).toFixed(digits) : null;
  const dir = delta == null ? 'flat' : delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : 'flat';
  const dirColor = dir === 'up' ? colors.safe : dir === 'down' ? colors.danger : 'var(--text-secondary)';
  const sign = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
  return (
    <div className="rounded-lg border border-surface-secondary p-3">
      <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-data)' }}>{cur.avg.toFixed(digits)}{unit}</span>
        {delta != null && (
          <span className="text-xs font-medium" style={{ color: dirColor, fontFamily: 'var(--font-data)' }}>
            {sign}{Math.abs(delta).toFixed(digits)}{unit}
          </span>
        )}
      </div>
      <p className="text-[11px] text-text-secondary mt-0.5">전월 대비 · 측정 {cur.n}명</p>
    </div>
  );
}

function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const w = 150, h = 32;
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...pts.map(p => p.v));
  const max = Math.max(...pts.map(p => p.v));
  const rangeX = (pts[pts.length - 1].i - pts[0].i) || 1;
  const coords = pts.map(p => {
    const px = ((p.i - pts[0].i) / rangeX) * (w - 6) + 3;
    const py = max === min ? h / 2 : h - 4 - ((p.v - min) / (max - min)) * (h - 8);
    return [px, py] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const areaPath = `${path} L${last[0].toFixed(1)},${h} L${coords[0][0].toFixed(1)},${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
    </svg>
  );
}

function BodyCompositionTab() {
  const [data, setData] = useState<BodyCompositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState('');

  const load = () => {
    setLoading(true);
    fetchBodyCompositionRecords().then(setData).finally(() => setLoading(false));
  };

  const runSync = async (silent: boolean) => {
    setSyncing(true);
    try {
      const result = await syncBodyCompositionFromGoogleSheet();
      load();
      const msg = result.unmatchedNames.length > 0
        ? `${result.updatedCount}건 반영 (매칭 안 됨: ${result.unmatchedNames.join(', ')})`
        : `${result.updatedCount}건 반영`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 존재하는 모든 (연도, 월) 조합을 시간순으로 정렬해 열로 사용 — 시트에 새 달이 추가되면 자동으로 늘어난다.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const row of data) set.add(`${row.year}-${row.month}`);
    return [...set]
      .map(key => { const [year, month] = key.split('-').map(Number); return { year, month, key }; })
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }, [data]);

  const byPlayer = useMemo(() => {
    const map = new Map<string, { player_name: string; jersey_number: number | null; cells: Map<string, { height: number | null; weight: number | null }> }>();
    for (const row of data) {
      if (!map.has(row.player_id)) {
        map.set(row.player_id, { player_name: row.player_name, jersey_number: row.jersey_number, cells: new Map() });
      }
      map.get(row.player_id)!.cells.set(`${row.year}-${row.month}`, { height: row.height, weight: row.weight });
    }
    return [...map.entries()]
      .filter(([, p]) => !search || p.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort(([, a], [, b]) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [data, search]);

  // 팀 전체 월별 통계 (검색어와 무관하게 항상 전체 선수 기준)
  const monthlyStats = useMemo(() => {
    return months.map(m => {
      const heights: number[] = [], weights: number[] = [], bmis: number[] = [];
      for (const row of data) {
        if (`${row.year}-${row.month}` !== m.key) continue;
        if (row.height != null) heights.push(row.height);
        if (row.weight != null) weights.push(row.weight);
        const b = bodyBmi(row.height, row.weight);
        if (b != null) bmis.push(b);
      }
      const stat = (arr: number[]) => arr.length ? { avg: arr.reduce((a, b) => a + b, 0) / arr.length, min: Math.min(...arr), max: Math.max(...arr), n: arr.length } : null;
      return { ...m, h: stat(heights), w: stat(weights), b: stat(bmis) };
    });
  }, [months, data]);

  const [trendMetric, setTrendMetric] = useState<'h' | 'w' | 'b'>('h');
  const trendChartData = monthlyStats.map(s => {
    const st = s[trendMetric];
    return { month: `${s.month}월`, min: st?.min ?? null, range: st ? +(st.max - st.min).toFixed(2) : null, avg: st ? +st.avg.toFixed(trendMetric === 'b' ? 2 : 1) : null };
  });
  const TREND_LABEL = { h: '신장(cm)', w: '체중(kg)', b: 'BMI' } as const;

  // 자유 형식 파싱이 잘못됐을 가능성이 높은 이상치 (BMI가 비정상 범위)
  const outliers = useMemo(() => {
    return data
      .map(row => ({ row, bmi: bodyBmi(row.height, row.weight) }))
      .filter(x => isBmiOutlier(x.bmi))
      .sort((a, b) => a.row.player_name.localeCompare(b.row.player_name));
  }, [data]);

  // 최근 두 달 사이 체중 증가량 TOP 5
  const leaderboard = useMemo(() => {
    if (months.length < 2) return [];
    const lastKey = months[months.length - 1].key, prevKey = months[months.length - 2].key;
    return byPlayer
      .map(([id, p]) => {
        const from = p.cells.get(prevKey)?.weight ?? null;
        const to = p.cells.get(lastKey)?.weight ?? null;
        if (from == null || to == null) return null;
        return { id, name: p.player_name, delta: +(to - from).toFixed(2), from, to };
      })
      .filter((x): x is { id: string; name: string; delta: number; from: number; to: number } => x != null)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
  }, [byPlayer, months]);
  const maxLeaderboardDelta = Math.max(...leaderboard.map(r => r.delta), 0.1);

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
        구글 시트(월별 신장·체중 자동 기록)에서 동기화됩니다. 탭 진입 시 자동 반영되며, 시트에 새 달이 추가되면 열도 자동으로 늘어납니다.
      </p>

      {!loading && months.length > 0 && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-3 gap-3 stat-grid-4">
            <BodyStat label={`평균 신장 (${monthlyStats[monthlyStats.length - 1].month}월)`} unit="cm" digits={1}
              cur={monthlyStats[monthlyStats.length - 1].h} prev={monthlyStats[monthlyStats.length - 2]?.h ?? null} />
            <BodyStat label={`평균 체중 (${monthlyStats[monthlyStats.length - 1].month}월)`} unit="kg" digits={1}
              cur={monthlyStats[monthlyStats.length - 1].w} prev={monthlyStats[monthlyStats.length - 2]?.w ?? null} />
            <BodyStat label={`평균 BMI (${monthlyStats[monthlyStats.length - 1].month}월)`} unit="" digits={2}
              cur={monthlyStats[monthlyStats.length - 1].b} prev={monthlyStats[monthlyStats.length - 2]?.b ?? null} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
            <div className="chart-card">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div className="chart-title !mb-0">팀 성장 추이</div>
                <div className="flex gap-1 p-0.5 rounded-lg bg-surface-secondary">
                  {(['h', 'w', 'b'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setTrendMetric(m)}
                      className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${trendMetric === m ? 'bg-surface font-semibold' : 'text-text-secondary'}`}
                    >
                      {TREND_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-text-secondary mb-2">팀 평균 {TREND_LABEL[trendMetric]} 추이 · 음영은 최저~최고 구간</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={40} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} formatter={(v: any, key: any) => key === 'avg' ? [v, '팀 평균'] : [v, key]} />
                  <Area type="monotone" dataKey="min" stackId="band" stroke="none" fill="transparent" />
                  <Area type="monotone" dataKey="range" stackId="band" stroke="none" fill={chartColors.grid} fillOpacity={0.9} name="최저~최고" />
                  <Line type="monotone" dataKey="avg" stroke={colors.navy} strokeWidth={2.5} dot={{ r: 3 }} name="팀 평균" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-title">데이터 이상치 <span className="text-text-secondary font-normal text-xs">({outliers.length}건)</span></div>
              <p className="text-[11px] text-text-secondary mb-2">셀 값이 자동 파싱 범위를 벗어나 확인이 필요한 항목 (BMI 10 미만 또는 45 초과)</p>
              {outliers.length === 0 ? (
                <p className="text-sm text-text-secondary py-2">✅ 이상 없음</p>
              ) : (
                <div className="space-y-2 max-h-[170px] overflow-y-auto">
                  {outliers.map((o, i) => (
                    <div key={i} className="rounded-lg p-2.5 bg-red-50 border border-red-200">
                      <p className="text-xs font-bold">{o.row.player_name} · {o.row.year}.{o.row.month}월</p>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        신장 {fmt(o.row.height)}cm · 체중 {fmt(o.row.weight)}kg → BMI {o.bmi} — 시트에서 단위 구분 후 재확인 필요
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {leaderboard.length > 0 && (
            <div className="chart-card">
              <div className="chart-title">
                이달의 변화 TOP 5 <span className="text-text-secondary font-normal text-xs">({months[months.length - 2].month}월 → {months[months.length - 1].month}월, 체중 증가량 기준)</span>
              </div>
              <div className="space-y-2 mt-2">
                {leaderboard.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="w-5 text-text-secondary text-xs" style={{ fontFamily: 'var(--font-data)' }}>{i + 1}</span>
                    <span className="w-20 text-sm font-medium truncate">{r.name}</span>
                    <span className="w-28 text-sm font-semibold" style={{ color: colors.safe, fontFamily: 'var(--font-data)' }}>+{r.delta}kg</span>
                    <span className="w-28 text-xs text-text-secondary" style={{ fontFamily: 'var(--font-data)' }}>{r.from.toFixed(1)} → {r.to.toFixed(1)}kg</span>
                    <div className="flex-1 h-1.5 rounded bg-surface-secondary overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(r.delta / maxLeaderboardDelta) * 100}%`, background: colors.safe }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">선수별 추이 ({byPlayer.length}명)</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {byPlayer.map(([playerId, p]) => {
                const heights = months.map(m => p.cells.get(m.key)?.height ?? null);
                const weights = months.map(m => p.cells.get(m.key)?.weight ?? null);
                const lastHeight = [...heights].reverse().find(v => v != null) ?? null;
                const lastWeight = [...weights].reverse().find(v => v != null) ?? null;
                const flagged = outliers.some(o => o.row.player_id === playerId);
                return (
                  <div key={playerId} className={`rounded-lg border p-2.5 ${flagged ? 'border-red-300' : 'border-surface-secondary'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{p.player_name}</span>
                      {flagged && <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">확인필요</span>}
                    </div>
                    <div className="flex gap-3 text-[11px] text-text-secondary mt-1">
                      <span>키 <b className="text-[var(--text)]">{fmt(lastHeight)}</b>cm</span>
                      <span>체중 <b className="text-[var(--text)]">{fmt(lastWeight)}</b>kg</span>
                    </div>
                    <Sparkline values={heights} color={colors.navy} />
                    <Sparkline values={weights} color={colors.wine} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">로우 데이터</div>
      {loading ? (
        <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
      ) : byPlayer.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-16">데이터가 없습니다.</p>
      ) : (
        <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)', minWidth: 'max-content' }}>
              <thead>
                <tr className="border-b border-surface-secondary">
                  <th rowSpan={2} className="px-2.5 py-2.5 text-left text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface align-bottom">이름</th>
                  <th colSpan={months.length} className="px-2.5 py-1.5 text-center text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface">월별 신장(cm)</th>
                  <th colSpan={months.length} className="px-2.5 py-1.5 text-center text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface">월별 체중(kg)</th>
                  <th colSpan={months.length} className="px-2.5 py-1.5 text-center text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface">월별 BMI</th>
                </tr>
                <tr className="border-b border-surface-secondary">
                  {months.map(m => <th key={`h-${m.key}`} className="px-2 py-2 text-center text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-6 bg-surface">{m.month}월</th>)}
                  {months.map(m => <th key={`w-${m.key}`} className="px-2 py-2 text-center text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-6 bg-surface">{m.month}월</th>)}
                  {months.map(m => <th key={`b-${m.key}`} className="px-2 py-2 text-center text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-6 bg-surface">{m.month}월</th>)}
                </tr>
              </thead>
              <tbody>
                {byPlayer.map(([playerId, p]) => (
                  <tr key={playerId} className="border-b border-surface-secondary/50 hover:bg-surface-secondary/30 transition-colors">
                    <td className="px-2.5 py-2 whitespace-nowrap font-medium">{p.player_name}</td>
                    {months.map(m => <td key={`h-${m.key}`} className="px-2 py-2 text-center whitespace-nowrap">{fmt(p.cells.get(m.key)?.height ?? null)}</td>)}
                    {months.map(m => <td key={`w-${m.key}`} className="px-2 py-2 text-center whitespace-nowrap">{fmt(p.cells.get(m.key)?.weight ?? null)}</td>)}
                    {months.map(m => {
                      const cell = p.cells.get(m.key);
                      return <td key={`b-${m.key}`} className="px-2 py-2 text-center whitespace-nowrap">{fmt(bodyBmi(cell?.height ?? null, cell?.weight ?? null))}</td>;
                    })}
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
function recomputeZones(mas: number, mss: number) {
  const asr = mss - mas;
  return {
    zone1_mas60: mas * 0.6,
    zone2_mas80: mas * 0.8,
    zone3_mas100: mas,
    zone4_asr20: mas + asr * 0.2,
    zone5_mss80: mss * 0.8,
  };
}

function SpeedCustomTab() {
  const [data, setData] = useState<SpeedCustomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSpeedCustomRecords().then(setData).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return data.filter(row => !search || row.player_name.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const handleSave = async (playerId: string, mas: number, mss: number) => {
    if (!Number.isFinite(mas) || !Number.isFinite(mss) || mas <= 0 || mss <= 0) return;
    setSavingId(playerId);
    try {
      await updateSpeedCustomOverride(playerId, mas, mss);
      setData(prev => prev.map(row => row.player_id === playerId
        ? { ...row, mas, mss, ...recomputeZones(mas, mss) }
        : row));
    } catch {
      alert('MAS/MSS 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingId(null);
    }
  };

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
        역대 최고 MAS·MSS 기록 기준 커스텀 속도 Zone (Zone1 MAS60% · Zone2 MAS80% · Zone3 MAS100% · Zone4 ASR20% · Zone5 MSS80%). MAS/MSS 값을 직접 수정하면 속도 구간이 자동으로 재계산됩니다.
      </p>

      {loading ? (
        <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-16">데이터가 없습니다. MAS/Sprint 테스트 기록이 필요합니다.</p>
      ) : (
        <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ fontFamily: 'var(--font-data)', minWidth: 'max-content' }}>
              <thead>
                <tr className="border-b border-surface-secondary">
                  {['이름', '포지션', '최고속도', '1구간', '2구간', '3구간', '4구간', '5구간', '6구간', 'MAS', 'MSS'].map(h => (
                    <th key={h} className="px-2.5 py-2.5 text-left text-[11px] text-text-secondary font-medium whitespace-nowrap sticky top-0 bg-surface">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.player_id} className="border-b border-surface-secondary/50 hover:bg-surface-secondary/30 transition-colors">
                    <td className="px-2.5 py-2 whitespace-nowrap font-medium">{row.player_name}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.position ?? '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.mss.toFixed(1)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">0 ~ {row.zone1_mas60.toFixed(1)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.zone1_mas60.toFixed(1)} ~ {row.zone2_mas80.toFixed(1)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.zone2_mas80.toFixed(1)} ~ {row.zone3_mas100.toFixed(1)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.zone3_mas100.toFixed(1)} ~ {row.zone4_asr20.toFixed(1)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.zone4_asr20.toFixed(1)} ~ {row.zone5_mss80.toFixed(1)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{row.zone5_mss80.toFixed(1)} ~</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <input
                        type="number"
                        step="0.1"
                        defaultValue={row.mas}
                        disabled={savingId === row.player_id}
                        onBlur={e => {
                          const v = parseFloat(e.target.value);
                          if (v !== row.mas) handleSave(row.player_id, v, row.mss);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-16 px-1.5 py-1 text-sm rounded border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400"
                        style={{ fontFamily: 'var(--font-data)' }}
                      />
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <input
                        type="number"
                        step="0.1"
                        defaultValue={row.mss}
                        disabled={savingId === row.player_id}
                        onBlur={e => {
                          const v = parseFloat(e.target.value);
                          if (v !== row.mss) handleSave(row.player_id, row.mas, v);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-16 px-1.5 py-1 text-sm rounded border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400"
                        style={{ fontFamily: 'var(--font-data)' }}
                      />
                    </td>
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

// ── 신체 성숙도 탭 ──────────────────────────────────────────────────────
function maturityFmt(v: number | string | null): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
}

// 신체 성숙도 계산 로직(player_phv_khamis_roche 뷰와 동일한 방식)
function calcAgeDecimal(birthDate: string, onDate: Date): number {
  const b = new Date(birthDate);
  return +(((onDate.getTime() - b.getTime()) / (1000 * 60 * 60 * 24 * 365.25))).toFixed(3);
}

// 앉은 키가 의자 높이를 포함해 입력된 경우(신장 대비 65% 초과) 보정
function calcSittingHeight(height: number, sittingRaw: number, chairHeight: number): number {
  return sittingRaw / height > 0.65 ? sittingRaw - chairHeight : sittingRaw;
}

function adjMotherHeight(cm: number): number { return (cm * 0.3937 * 0.953 + 2.803) * 2.54; }
function adjFatherHeight(cm: number): number { return (cm * 0.3937 * 0.955 + 2.316) * 2.54; }

function findKhamisRocheCoef(coefs: KhamisRocheCoefficient[], age: number): KhamisRocheCoefficient | null {
  const sorted = [...coefs].sort((a, b) => a.age_decimal - b.age_decimal);
  let match: KhamisRocheCoefficient | null = null;
  for (const c of sorted) {
    if (c.age_decimal <= age) match = c;
    else break;
  }
  return match ?? sorted[0] ?? null;
}

interface ScratchResult {
  ageDecimal: number;
  legLength: number;
  sittingHeight: number;
  offset: number;
  aphv: number;
  stage: string;
  predictedHeight: number;
  pahPercent: number;
}

function calcMaturityScratch(input: {
  height: number; weight: number; chairHeight: number; sittingRaw: number;
  motherHeight: number; fatherHeight: number; birthDate: string;
}, coefs: KhamisRocheCoefficient[]): ScratchResult | null {
  const { height, weight, chairHeight, sittingRaw, motherHeight, fatherHeight, birthDate } = input;
  if (!height || !weight || !chairHeight || !sittingRaw || !motherHeight || !fatherHeight || !birthDate) return null;

  const ageDecimal = calcAgeDecimal(birthDate, new Date());
  const sittingHeight = calcSittingHeight(height, sittingRaw, chairHeight);
  const legLength = height - sittingHeight;
  const coef = findKhamisRocheCoef(coefs, ageDecimal);
  if (!coef) return null;

  const midparentStature = (adjMotherHeight(motherHeight) + adjFatherHeight(fatherHeight)) / 2;
  const predictedHeight = coef.bo + coef.coef_stature * height + coef.coef_weight * weight + coef.coef_midparent_stature * midparentStature;
  const pahPercent = (height / predictedHeight) * 100;

  const offset = -9.236
    + 0.0002708 * (legLength * sittingHeight)
    - 0.001663 * (ageDecimal * legLength)
    + 0.007216 * (ageDecimal * sittingHeight)
    + 0.02292 * ((weight / height) * 100);
  const aphv = ageDecimal - offset;
  const stage = offset < -1 ? '성장 급증기 전' : offset <= 1 ? '성장 급증기' : '성장 급증기 후';

  return {
    ageDecimal, legLength, sittingHeight,
    offset: +offset.toFixed(2), aphv: +aphv.toFixed(2), stage,
    predictedHeight: +predictedHeight.toFixed(1), pahPercent: +pahPercent.toFixed(1),
  };
}

function MaturityScratchCalculator() {
  const [coefs, setCoefs] = useState<KhamisRocheCoefficient[]>([]);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [chairHeight, setChairHeight] = useState('');
  const [sittingHeight, setSittingHeight] = useState('');
  const [motherHeight, setMotherHeight] = useState('');
  const [fatherHeight, setFatherHeight] = useState('');

  useEffect(() => {
    fetchKhamisRocheCoefficients().then(setCoefs);
  }, []);

  const age = birthDate ? calcAgeDecimal(birthDate, new Date()) : null;

  const result = useMemo(() => {
    const h = parseFloat(height), w = parseFloat(weight), ch = parseFloat(chairHeight),
      sh = parseFloat(sittingHeight), mh = parseFloat(motherHeight), fh = parseFloat(fatherHeight);
    if (!birthDate || [h, w, ch, sh, mh, fh].some(v => isNaN(v) || v <= 0) || coefs.length === 0) return null;
    return calcMaturityScratch({ height: h, weight: w, chairHeight: ch, sittingRaw: sh, motherHeight: mh, fatherHeight: fh, birthDate }, coefs);
  }, [height, weight, chairHeight, sittingHeight, motherHeight, fatherHeight, birthDate, coefs]);

  const inputC = 'px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400 w-full';
  const labelC = 'text-[11px] text-text-secondary mb-1 block';

  return (
    <div>
      <p className="text-[11px] text-text-secondary mb-3">
        선수 명단에 없는 인원을 대상으로 신체 성숙도(PHV Offset·APHV·Khamis-Roche 예측키·%PAH)를 임시로 계산합니다.
        여기서 입력한 값은 저장되지 않으며 선수 명단에도 추가되지 않습니다.
      </p>

      <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelC}>이름</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputC} placeholder="이름" />
          </div>
          <div>
            <label className={labelC}>생년월일 {age != null && <span className="text-cyan-500">(만 {age.toFixed(1)}세)</span>}</label>
            <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputC} />
          </div>
          <div>
            <label className={labelC}>신장(cm)</label>
            <input type="number" value={height} onChange={e => setHeight(e.target.value)} className={inputC} placeholder="예: 165" />
          </div>
          <div>
            <label className={labelC}>몸무게(kg)</label>
            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} className={inputC} placeholder="예: 52" />
          </div>
          <div>
            <label className={labelC}>의자 높이(cm)</label>
            <input type="number" value={chairHeight} onChange={e => setChairHeight(e.target.value)} className={inputC} placeholder="예: 45" />
          </div>
          <div>
            <label className={labelC}>앉은 키(cm)</label>
            <input type="number" value={sittingHeight} onChange={e => setSittingHeight(e.target.value)} className={inputC} placeholder="예: 86" />
          </div>
          <div>
            <label className={labelC}>엄마 신장(cm)</label>
            <input type="number" value={motherHeight} onChange={e => setMotherHeight(e.target.value)} className={inputC} placeholder="예: 163" />
          </div>
          <div>
            <label className={labelC}>아빠 신장(cm)</label>
            <input type="number" value={fatherHeight} onChange={e => setFatherHeight(e.target.value)} className={inputC} placeholder="예: 178" />
          </div>
        </div>
      </div>

      {result ? (
        <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] p-5">
          {name && <p className="text-sm font-medium mb-3">{name}</p>}
          <div className="grid grid-cols-5 gap-4" style={{ fontFamily: 'var(--font-data)' }}>
            <div>
              <p className="text-[11px] text-text-secondary mb-1">PHV Offset</p>
              <p className="text-xl font-medium">{result.offset}</p>
            </div>
            <div>
              <p className="text-[11px] text-text-secondary mb-1">APHV</p>
              <p className="text-xl font-medium">{result.aphv}</p>
            </div>
            <div>
              <p className="text-[11px] text-text-secondary mb-1">성숙 단계</p>
              <p className="text-xl font-medium">{result.stage}</p>
            </div>
            <div>
              <p className="text-[11px] text-text-secondary mb-1">Khamis-Roche 예측키(cm)</p>
              <p className="text-xl font-medium">{result.predictedHeight}</p>
            </div>
            <div>
              <p className="text-[11px] text-text-secondary mb-1">%PAH</p>
              <p className="text-xl font-medium">{result.pahPercent}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-secondary text-center py-10">모든 값을 입력하면 결과가 표시됩니다.</p>
      )}
    </div>
  );
}

function MaturityRosterTab() {
  const [data, setData] = useState<MaturityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.player_id)));
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}명의 신체 성숙도 값을 삭제할까요? (선수 명단 자체는 유지되고, 입력된 성숙도 값만 초기화됩니다)`)) return;
    setDeleting(true);
    try {
      await clearMaturityData([...selected]);
      setSelected(new Set());
      load();
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

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
        {selected.size > 0 && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs rounded-md border border-red-400 text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            {deleting ? '삭제 중...' : `선택 삭제 (${selected.size})`}
          </button>
        )}
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
                  <th className="px-2.5 py-2.5 sticky top-0 bg-surface">
                    <input type="checkbox" checked={selected.size === filtered.length} onChange={toggleAll} />
                  </th>
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
                    <td className="px-2.5 py-2">
                      <input type="checkbox" checked={selected.has(row.player_id)} onChange={() => toggleOne(row.player_id)} />
                    </td>
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

function MaturityTab() {
  const [subTab, setSubTab] = useState<'roster' | 'scratch'>('roster');

  const subTabBtn = (id: 'roster' | 'scratch', label: string) => (
    <button
      onClick={() => setSubTab(id)}
      className={`px-3 py-1.5 text-sm rounded border transition-colors ${
        subTab === id ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="flex gap-2 mb-3">
        {subTabBtn('roster', '선수 명단')}
        {subTabBtn('scratch', '임시 계산')}
      </div>
      {subTab === 'roster' ? <MaturityRosterTab /> : <MaturityScratchCalculator />}
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
