import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchPlayersBySeason,
  fetchSeasonYears,
  addPlayer,
  updatePlayer,
  deletePlayer,
  deletePlayers,
  uploadPlayerPhoto,
} from '../lib/api';
import type { Player, Position, Grade } from '../types';

const CURRENT_YEAR = new Date().getFullYear();

const POSITIONS: Position[] = ['GK', 'CB', 'FB', 'MF', 'WF', 'CF', 'CAM', 'CDM', 'CM', 'FW', 'ST', 'RW', 'LW', 'RB', 'LB', 'DF'];
const GRADES: Grade[] = ['3학년', '2학년', '1학년'];
const FEET = ['왼발', '오른발', '전체'] as const;

type TabFilter = '전체' | '3학년' | '2학년' | '1학년' | 'FW' | 'MF' | 'DF';

function positionGroup(pos: string): 'FW' | 'MF' | 'DF' | null {
  if (['GK', 'CB', 'FB', 'RB', 'LB', 'DF'].includes(pos)) return 'DF';
  if (['MF', 'CM', 'CAM', 'CDM'].includes(pos)) return 'MF';
  if (['FW', 'CF', 'ST', 'WF', 'RW', 'LW'].includes(pos)) return 'FW';
  return null;
}

function PlayerAvatar({ src, size = 40 }: { src?: string | null; size?: number }) {
  return src ? (
    <img
      src={src}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      alt=""
    />
  ) : (
    <div
      className="rounded-full bg-surface-secondary flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.45 }} className="text-text-disabled">👤</span>
    </div>
  );
}

interface EditForm {
  name: string;
  birth_date: string;
  jersey_number: string;
  position: Position;
  grade: Grade;
  preferred_foot: string;
}

function PlayerModal({
  player,
  onClose,
  onSave,
  onReload,
}: {
  player: Player;
  onClose: () => void;
  onSave: (id: string, form: EditForm) => Promise<void>;
  onReload: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    name: player.name,
    birth_date: player.birth_date || '',
    jersey_number: String(player.jersey_number),
    position: player.position,
    grade: player.grade as Grade,
    preferred_foot: player.preferred_foot || '오른발',
  });
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(player.photo_url);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof EditForm, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(player.id, form);
    setSaving(false);
  };

  const handlePhotoClick = () => fileRef.current?.click();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPlayerPhoto(player.id, file);
      setPhotoUrl(url);
      onReload();
    } catch { /* */ }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-[480px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Avatar */}
        <div className="flex flex-col items-center pt-8 pb-4">
          <div className="relative cursor-pointer group" onClick={handlePhotoClick}>
            {photoUrl ? (
              <img src={photoUrl} className="w-24 h-24 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-surface-secondary flex items-center justify-center">
                <span className="text-4xl text-text-disabled">👤</span>
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-lg">📷</span>
            </div>
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <span className="text-white text-xs">업로드중...</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <p className="text-xs text-text-disabled mt-2">사진을 클릭하여 변경</p>
        </div>

        <div className="px-8 pb-8 space-y-5">
          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">이름</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full px-4 py-3 text-base rounded-lg border border-surface-secondary bg-[var(--bg)]" />
          </div>

          {/* 생년월일 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">생년월일</label>
            <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)}
              className="w-full px-4 py-3 text-base rounded-lg border border-surface-secondary bg-[var(--bg)]" />
          </div>

          {/* 등번호 + 포지션 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">등번호</label>
              <input type="number" value={form.jersey_number} onChange={e => set('jersey_number', e.target.value)}
                className="w-full px-4 py-3 text-base rounded-lg border border-surface-secondary bg-[var(--bg)]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">포지션</label>
              <select value={form.position} onChange={e => set('position', e.target.value)}
                className="w-full px-4 py-3 text-base rounded-lg border border-surface-secondary bg-[var(--bg)]">
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* 그룹 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">그룹</label>
            <select value={form.grade} onChange={e => set('grade', e.target.value)}
              className="w-full px-4 py-3 text-base rounded-lg border border-surface-secondary bg-[var(--bg)]">
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* 주 발 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">주 발</label>
            <div className="flex items-center gap-6">
              {FEET.map(foot => (
                <label key={foot} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="foot" checked={form.preferred_foot === foot}
                    onChange={() => set('preferred_foot', foot)} className="accent-cyan-400 w-5 h-5" />
                  <span className="text-sm">{foot}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-lg bg-cyan-400 text-black font-medium hover:bg-cyan-300 transition-colors disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-lg border border-surface-secondary text-text-secondary hover:bg-surface-secondary transition-colors">
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasonYears, setSeasonYears] = useState<number[]>([CURRENT_YEAR]);
  const [seasonYear, setSeasonYear] = useState(CURRENT_YEAR);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('전체');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newPosition, setNewPosition] = useState<Position>('MF');
  const [newGrade, setNewGrade] = useState<Grade>('3학년');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);

  const loadYears = useCallback(async () => {
    try {
      const years = await fetchSeasonYears();
      if (years.length > 0) {
        setSeasonYears(years);
        setSeasonYear(prev => (years.includes(prev) ? prev : years[0]));
      }
    } catch { /* */ }
  }, []);

  const load = useCallback(async () => {
    try { setPlayers(await fetchPlayersBySeason(seasonYear)); } catch { /* */ }
  }, [seasonYear]);

  useEffect(() => { loadYears(); }, [loadYears]);
  useEffect(() => { load(); }, [load]);

  const filtered = players.filter(p => {
    if (search && !p.name.includes(search)) return false;
    if (activeTab === '전체') return true;
    if (GRADES.includes(activeTab as Grade)) return p.grade === activeTab;
    return positionGroup(p.position) === activeTab;
  });

  const tabCounts = {
    '전체': players.length,
    '3학년': players.filter(p => p.grade === '3학년').length,
    '2학년': players.filter(p => p.grade === '2학년').length,
    '1학년': players.filter(p => p.grade === '1학년').length,
    'FW': players.filter(p => positionGroup(p.position) === 'FW').length,
    'MF': players.filter(p => positionGroup(p.position) === 'MF').length,
    'DF': players.filter(p => positionGroup(p.position) === 'DF').length,
  };

  const tabs: TabFilter[] = ['전체', '3학년', '2학년', '1학년', 'FW', 'MF', 'DF'];
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(p => next.delete(p.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(p => next.add(p.id)); return next; });
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}명의 선수를 삭제하시겠습니까?\n관련된 모든 훈련/경기 데이터도 함께 삭제됩니다.`)) return;
    try { await deletePlayers([...selected]); setSelected(new Set()); await load(); } catch { /* */ }
  };

  const handleBulkGrade = async (grade: string) => {
    if (selected.size === 0) return;
    try { await Promise.all([...selected].map(id => updatePlayer(id, { grade }))); await load(); } catch { /* */ }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newNumber) return;
    try {
      await addPlayer({ name: newName.trim(), jersey_number: parseInt(newNumber), position: newPosition, grade: newGrade }, seasonYear);
      setNewName(''); setNewNumber(''); setShowAddForm(false); await loadYears(); await load();
    } catch { /* */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 선수를 삭제하시겠습니까?\n관련된 모든 훈련/경기 데이터도 함께 삭제됩니다.')) return;
    try { await deletePlayer(id); await load(); } catch { /* */ }
  };

  const handleModalSave = async (id: string, form: EditForm) => {
    try {
      await updatePlayer(id, {
        name: form.name,
        jersey_number: parseInt(form.jersey_number) || 0,
        position: form.position,
        grade: form.grade,
        birth_date: form.birth_date || undefined,
        preferred_foot: form.preferred_foot,
      });
      setEditPlayer(null);
      await load();
    } catch { /* */ }
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <p className="text-sm text-text-secondary mb-2">설정 / 선수</p>
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-cyan-400 rounded-sm inline-block" />
        선수 관리
      </h1>

      {/* 연도(시즌) 탭 */}
      <div className="flex items-center gap-1 mb-4">
        {seasonYears.map(year => (
          <button key={year} onClick={() => setSeasonYear(year)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              seasonYear === year ? 'bg-purple text-white' : 'bg-surface-secondary text-text-secondary hover:text-text-primary'
            }`}>
            {year}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-xl shadow-[var(--shadow-1)] overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-6 pb-4 border-b border-surface-secondary flex-wrap">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 transition-colors ${
                activeTab === tab ? 'bg-cyan-400/15 text-cyan-400 font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
              }`}>
              {tab}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-cyan-400/20' : 'bg-surface-secondary'}`}>
                {tabCounts[tab]}
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-1.5 text-sm rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors">
            + 선수 추가
          </button>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="px-6 py-3 bg-cyan-400/5 border-b border-surface-secondary flex items-center gap-3">
            <span className="text-sm font-medium text-cyan-400">{selected.size}명 선택됨</span>
            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs text-text-secondary">일괄 그룹 변경:</span>
              {GRADES.map(g => (
                <button key={g} onClick={() => handleBulkGrade(g)}
                  className="px-2.5 py-1 text-xs rounded border border-surface-secondary hover:bg-surface-secondary transition-colors">{g}</button>
              ))}
            </div>
            <div className="flex-1" />
            <button onClick={() => setSelected(new Set())}
              className="px-3 py-1 text-xs rounded border border-surface-secondary text-text-secondary hover:bg-surface-secondary transition-colors">선택 해제</button>
            <button onClick={handleBulkDelete}
              className="px-3 py-1 text-xs rounded border border-red-400 text-red-400 hover:bg-red-400/10 transition-colors">선택 삭제</button>
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-surface-secondary/30 border-b border-surface-secondary flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-text-secondary mb-1">등번호</label>
              <input type="number" value={newNumber} onChange={e => setNewNumber(e.target.value)}
                className="w-20 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-surface" placeholder="#" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">이름</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                className="w-32 px-2 py-1.5 text-sm rounded border border-surface-secondary bg-surface" placeholder="이름" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">포지션</label>
              <select value={newPosition} onChange={e => setNewPosition(e.target.value as Position)}
                className="px-2 py-1.5 text-sm rounded border border-surface-secondary bg-surface">
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">그룹</label>
              <select value={newGrade} onChange={e => setNewGrade(e.target.value as Grade)}
                className="px-2 py-1.5 text-sm rounded border border-surface-secondary bg-surface">
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <button onClick={handleAdd} className="px-4 py-1.5 text-sm rounded bg-cyan-400 text-black font-medium hover:bg-cyan-300 transition-colors">추가</button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-1.5 text-sm rounded border border-surface-secondary text-text-secondary hover:bg-surface-secondary transition-colors">취소</button>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 flex items-center justify-between">
          <p className="text-sm font-medium">{activeTab}</p>
          <div className="relative">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="검색"
              className="w-48 pl-3 pr-8 py-1.5 text-sm rounded border border-surface-secondary bg-transparent" />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-disabled text-xs">🔍</span>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-surface-secondary text-text-secondary text-left">
              <th className="px-6 py-3 w-10">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="accent-cyan-400 w-4 h-4 cursor-pointer" />
              </th>
              <th className="px-3 py-3 font-medium w-16"></th>
              <th className="px-3 py-3 font-medium w-20">등번호 ↑</th>
              <th className="px-3 py-3 font-medium">이름</th>
              <th className="px-3 py-3 font-medium w-28 text-center">포지션</th>
              <th className="px-3 py-3 font-medium w-28 text-center">그룹</th>
              <th className="px-3 py-3 font-medium w-20 text-center">설정</th>
              <th className="px-3 py-3 font-medium w-20 text-center">삭제</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(player => (
              <tr key={player.id} className={`border-t border-surface-secondary transition-colors ${
                selected.has(player.id) ? 'bg-cyan-400/5' : 'hover:bg-surface-secondary/30'
              }`}>
                <td className="px-6 py-2">
                  <input type="checkbox" checked={selected.has(player.id)} onChange={() => toggleOne(player.id)}
                    className="accent-cyan-400 w-4 h-4 cursor-pointer" />
                </td>
                <td className="px-3 py-2">
                  <PlayerAvatar src={player.photo_url} size={32} />
                </td>
                <td className="px-3 py-2">{player.jersey_number}</td>
                <td className="px-3 py-2 font-medium">{player.name}</td>
                <td className="px-3 py-2 text-center text-text-secondary">{player.position}</td>
                <td className="px-3 py-2 text-center">
                  <span className="px-2 py-0.5 text-xs rounded bg-surface-secondary">{player.grade}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => setEditPlayer(player)} className="text-cyan-400 hover:text-cyan-300 text-xs">⚙ 설정</button>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => handleDelete(player.id)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-sm text-text-secondary text-center py-8">선수가 없습니다.</p>
        )}
      </div>

      {editPlayer && (
        <PlayerModal player={editPlayer} onClose={() => setEditPlayer(null)} onSave={handleModalSave} onReload={load} />
      )}
    </div>
  );
}
