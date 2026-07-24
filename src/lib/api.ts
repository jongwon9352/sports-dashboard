import { supabase } from './supabase';
import type {
  Player, PlayerWithAcwr, AcwrZone, AcwrDaily, TrainingDaily,
  TeamDailyAggregate, DailyReportRow, SidebarPlayer, MatchData, MatchReportRow,
} from '../types';
import {
  calculateAcuteEwma,
  calculateAcwr,
  calculateChronicEwma,
  calculateMonotony,
  getAcwrZone,
} from '../utils/calculations';
import type { ParsedDailyRow, ParsedSessionRow, ParsedMatchSessionRow, ParsedPhysicalRow, ParsedBodyCompositionRow, ForcedecksRow, NordbordRow, ForceframeRow, SmartspeedRow } from '../utils/csvParser';
import { parseMaturitySheetCsv, parseSheetTimestampToDate, parseDailyCsv, parseBodySheetCsv } from '../utils/csvParser';
import { parseMatchFilename, parseMatchSessionFilename } from '../utils/csvParser';

const GOOGLE_SHEET_PUB_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAl_Jr193NUoZilorIYC7VWfazt4r_CTFRyHycEOWz3DFu_YEUhNGhaIqW2_5R81WrSg1J42WlntRm/pub?gid=179117944&single=true&output=csv';
const GOOGLE_SHEET_MATURITY_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSqPvqKWf2mgJBub7W6ZlU4RInG4GeYF37brcZmCiO0bT7wnF3JEPp2GekynyxTARrl1IYbNJpLJ3Iy/pub?gid=1965396254&single=true&output=csv';
const GOOGLE_SHEET_BODY_URL = 'https://docs.google.com/spreadsheets/d/1dV8bxty3ScTlDkn2jLcZbIcvuIQjaWduQjmuz5gbQcM/export?format=csv&gid=953747735';

export interface GoogleSheetRpe {
  date: string;
  name: string;
  rpe: number;
  session: '오전' | '오후' | null;
}

function parseGoogleTimestamp(ts: string): string {
  const m = ts.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function parseGoogleTimestampSession(ts: string): '오전' | '오후' | null {
  if (ts.includes('오전')) return '오전';
  if (ts.includes('오후')) return '오후';
  return null;
}

export async function fetchGoogleSheetRpe(): Promise<GoogleSheetRpe[]> {
  const res = await fetch(GOOGLE_SHEET_PUB_URL);
  if (!res.ok) throw new Error('구글 시트를 불러올 수 없습니다.');
  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const results: GoogleSheetRpe[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    const date = parseGoogleTimestamp(cols[0]);
    const session = parseGoogleTimestampSession(cols[0]);
    const rpe = parseFloat(cols[1]);
    const name = cols[2].normalize('NFC').trim();
    if (date && name && !isNaN(rpe)) {
      results.push({ date, name, rpe, session });
    }
  }
  return results;
}

// Supabase client responses are untyped in this project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase 환경 변수가 설정되어 있지 않습니다.');
  }
  return supabase;
}

function normalizeName(name: string) {
  return name.normalize('NFC').trim();
}

function defaultPlayer(name: string, jerseyNumber: number) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    jersey_number: jerseyNumber,
    position: 'MF',
    grade: '1학년',
    birth_date: null,
    maturity_status: 'Mid',
    maturity_offset: 0,
    predicted_adult_height: 0,
    current_height: 0,
    current_weight: 0,
    latest_mas: null,
    latest_mss: null,
    created_at: now,
    updated_at: now,
  };
}

async function getOrCreatePlayers(
  rows: { player_name: string; jersey_number: number }[],
  seasonYear: number,
  overrides?: Map<string, string>,
) {
  const client = requireSupabase();
  const requested = new Map<string, number>();

  for (const row of rows) {
    const name = normalizeName(row.player_name);
    if (name && !requested.has(name)) requested.set(name, row.jersey_number);
  }

  if (requested.size === 0) return new Map<string, string>();

  const playerMap = new Map<string, string>();
  for (const [name, id] of overrides ?? []) playerMap.set(name, id);

  // overrides에 없는 이름은 players 테이블에도 전혀 없는 완전 신규 이름만 남는다
  // (기존에 존재하는 이름은 analyzePlayerNamesForSeason + resolveAmbiguousPlayerName을 거쳐 이미 overrides에 들어있어야 함)
  const names = [...requested.keys()].filter(name => !playerMap.has(name));
  if (names.length === 0) return playerMap;

  const missing = names.map(name => defaultPlayer(name, requested.get(name) ?? 0));

  const { data: inserted, error: insertError } = await client
    .from('players')
    .insert(missing)
    .select('id, name');
  if (insertError) throw insertError;

  const seasonRows = ((inserted as R[]) ?? []).map(player => {
    const name = normalizeName(player.name as string);
    playerMap.set(name, player.id as string);
    return { player_id: player.id as string, season_year: seasonYear, jersey_number: requested.get(name) ?? 0 };
  });

  if (seasonRows.length > 0) {
    const { error: seasonError } = await client
      .from('player_seasons')
      .upsert(seasonRows, { onConflict: 'player_id,season_year' });
    if (seasonError) throw seasonError;
  }

  return playerMap;
}

// ── 시즌별 선수 매칭 (동명이인 구분) ──────────────────────────────────────
export interface PlayerNameAnalysis {
  // 이번 시즌에 이미 등록되어 있거나, 완전히 새 이름이라 자동 생성해도 안전한 경우
  autoMap: Map<string, string>;
  // 다른 시즌에는 존재하지만 이번 시즌엔 없는 이름 — 동일 인물 진급인지 동명이인 신입인지 확인 필요
  ambiguous: { name: string; existingPlayerId: string; existingSeasons: number[] }[];
}

export async function analyzePlayerNamesForSeason(rows: { player_name: string }[], seasonYear: number): Promise<PlayerNameAnalysis> {
  const client = requireSupabase();
  const names = [...new Set(rows.map(r => normalizeName(r.player_name)).filter(Boolean))];
  if (names.length === 0) return { autoMap: new Map(), ambiguous: [] };

  const { data: matchedPlayers, error } = await client.from('players').select('id, name').in('name', names);
  if (error) throw error;
  const playerIdByName = new Map(((matchedPlayers as R[]) ?? []).map(p => [normalizeName(p.name as string), p.id as string]));

  const matchedIds = [...playerIdByName.values()];
  const { data: seasons } = matchedIds.length > 0
    ? await client.from('player_seasons').select('player_id, season_year').in('player_id', matchedIds)
    : { data: [] as R[] };
  const seasonsByPlayerId = new Map<string, number[]>();
  for (const s of (seasons as R[]) ?? []) {
    const pid = s.player_id as string;
    if (!seasonsByPlayerId.has(pid)) seasonsByPlayerId.set(pid, []);
    seasonsByPlayerId.get(pid)!.push(s.season_year as number);
  }

  const autoMap = new Map<string, string>();
  const ambiguous: PlayerNameAnalysis['ambiguous'] = [];

  for (const name of names) {
    const playerId = playerIdByName.get(name);
    if (!playerId) continue; // 완전히 새 이름 — getOrCreatePlayers가 알아서 생성, 시즌 등록은 아래에서 처리
    const existingSeasons = seasonsByPlayerId.get(playerId) ?? [];
    if (existingSeasons.includes(seasonYear)) {
      autoMap.set(name, playerId);
    } else {
      ambiguous.push({ name, existingPlayerId: playerId, existingSeasons });
    }
  }

  return { autoMap, ambiguous };
}

// 동명이인 확인 결과를 반영: 기존 인물 재사용(진급) 또는 신규 인물 생성
export async function resolveAmbiguousPlayerName(
  name: string,
  seasonYear: number,
  jerseyNumber: number,
  decision: { reuseExisting: true; existingPlayerId: string } | { reuseExisting: false }
): Promise<string> {
  const client = requireSupabase();

  if (decision.reuseExisting) {
    const { error } = await client
      .from('player_seasons')
      .upsert(
        { player_id: decision.existingPlayerId, season_year: seasonYear, jersey_number: jerseyNumber },
        { onConflict: 'player_id,season_year' }
      );
    if (error) throw error;
    return decision.existingPlayerId;
  }

  const { data: inserted, error: insertError } = await client
    .from('players')
    .insert(defaultPlayer(normalizeName(name), jerseyNumber))
    .select('id')
    .single();
  if (insertError) throw insertError;
  const playerId = (inserted as R).id as string;

  const { error: seasonError } = await client
    .from('player_seasons')
    .insert({ player_id: playerId, season_year: seasonYear, jersey_number: jerseyNumber, grade: '1학년', position: 'MF' });
  if (seasonError) throw seasonError;

  return playerId;
}

// 시즌 스코프에서 신규 등록되는(동명이인 이슈 없는) 선수의 시즌 소속 레코드 보장
export async function ensurePlayerSeasonRecords(playerIds: string[], seasonYear: number, jerseyByPlayerId: Map<string, number>) {
  if (playerIds.length === 0) return;
  const client = requireSupabase();
  const rows = playerIds.map(id => ({
    player_id: id,
    season_year: seasonYear,
    jersey_number: jerseyByPlayerId.get(id) ?? 0,
  }));
  const { error } = await client
    .from('player_seasons')
    .upsert(rows, { onConflict: 'player_id,season_year' });
  if (error) throw error;
}

export async function importSessionCsvRows(rows: ParsedSessionRow[], date: string, seasonYear: number, overrides?: Map<string, string>) {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows, seasonYear, overrides);
  const now = new Date().toISOString();

  const sessionRows = validRows.map(row => ({
    id: crypto.randomUUID(),
    player_id: playerMap.get(normalizeName(row.player_name)),
    training_date: date,
    session_name: row.session_name,
    duration_min: row.duration_min,
    total_distance: row.total_distance,
    m_per_min: row.m_per_min,
    hsr_distance: row.hsr_distance,
    hsr_custom: row.hsr_custom,
    sprint_distance: row.sprint_distance,
    sprint_custom: row.sprint_custom,
    sprint_count: row.sprint_count,
    sprint_count_custom: row.sprint_count_custom,
    acc_count: row.acc_count,
    dec_count: row.dec_count,
    acd_load: row.acd_load,
    max_speed: row.max_speed,
    created_at: now,
  })).filter(row => row.player_id);

  if (sessionRows.length === 0) return;

  const { error } = await client
    .from('training_sessions')
    .upsert(sessionRows, { onConflict: 'player_id,training_date,session_name' });
  if (error) throw error;
}

const GRADE_TO_GROUP: Record<string, string> = {
  '1학년': 'U13',
  '2학년': 'U14',
  '3학년': 'U15',
};

// "K리그주니어"/"K리그 주니어"/"k리그주니어"처럼 표기가 섞여 들어와도 같은 대회로 인식하기 위한 정규화
function normalizeEventTypeForGroup(et: string): string {
  return et.replace(/\s/g, '').toLowerCase();
}

export async function importDailyCsvRows(rows: ParsedDailyRow[], date: string, seasonYear: number, overrides?: Map<string, string>) {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows, seasonYear, overrides);
  const now = new Date().toISOString();
  const parsedDate = new Date(date);
  const dayOfWeek = dayNames[parsedDate.getDay()] ?? '';

  const allPlayerIds = [...new Set([...playerMap.values()])];
  const { data: playerGrades } = await client
    .from('players')
    .select('id, grade')
    .in('id', allPlayerIds);
  const gradeMap = new Map((playerGrades ?? []).map((p: any) => [p.id as string, p.grade as string]));

  const dailyRows = validRows.map(row => {
    const playerId = playerMap.get(normalizeName(row.player_name));
    const dailyTrainingLoad = row.rpe !== null ? row.duration_min * row.rpe : null;
    const grade = playerId ? gradeMap.get(playerId) : undefined;
    const defaultGroupType = grade ? GRADE_TO_GROUP[grade] ?? null : null;

    return {
      id: crypto.randomUUID(),
      player_id: playerId,
      training_date: date,
      group_type: defaultGroupType,
      day_of_week: dayOfWeek,
      week_label: '',
      duration_min: row.duration_min,
      rpe: row.rpe,
      total_distance: row.total_distance,
      m_per_min: row.m_per_min,
      speed_zone_1: row.speed_zone_1,
      speed_zone_2: row.speed_zone_2,
      speed_zone_3: row.speed_zone_3,
      speed_zone_4: row.speed_zone_4,
      speed_zone_5: row.speed_zone_5,
      hsr_distance: row.hsr_distance,
      hsr_custom: row.hsr_custom,
      sprint_distance: row.sprint_distance,
      sprint_custom: row.sprint_custom,
      sprint_count: row.sprint_count,
      sprint_count_custom: row.sprint_count_custom,
      acc_count: row.acc_count,
      dec_count: row.dec_count,
      acd_load: row.acd_load,
      max_speed: row.max_speed,
      daily_training_load: dailyTrainingLoad,
      created_at: now,
    };
  }).filter(row => row.player_id);

  if (dailyRows.length === 0) return;

  const playerIds = [...new Set(dailyRows.map(r => r.player_id as string))];
  const { data: existing, error: existingError } = await client
    .from('training_daily')
    .select('player_id, group_type, duration_min, total_distance, m_per_min, speed_zone_1, speed_zone_2, speed_zone_3, speed_zone_4, speed_zone_5, hsr_distance, hsr_custom, sprint_distance, sprint_custom, sprint_count, sprint_count_custom, acc_count, dec_count, acd_load, max_speed, daily_training_load')
    .eq('training_date', date)
    .in('player_id', playerIds);
  if (existingError) throw existingError;

  const existMap = new Map((existing ?? []).map((e: any) => [e.player_id, e]));

  // 같은 날짜에 오전/오후처럼 세션이 나뉘어 여러 번 업로드되는 경우, 기존 기록을 덮어쓰지 않고
  // 부하·거리 지표를 합산한다. (같은 파일을 실수로 다시 올린 경우엔 먼저 파일 목록에서 삭제 후
  // 재업로드해야 중복 합산되지 않는다 — 삭제 시 해당 날짜 기록이 함께 제거된다.)
  const mergedRows = dailyRows.map(row => {
    const prev = existMap.get(row.player_id);
    if (!prev) return row;
    const duration = Number(prev.duration_min || 0) + Number(row.duration_min || 0);
    const totalDistance = Number(prev.total_distance || 0) + Number(row.total_distance || 0);
    const prevLoad = prev.daily_training_load != null ? Number(prev.daily_training_load) : null;
    const rowLoad = row.daily_training_load != null ? Number(row.daily_training_load) : null;
    const combinedLoad = prevLoad != null || rowLoad != null ? (prevLoad ?? 0) + (rowLoad ?? 0) : null;
    return {
      ...row,
      group_type: prev.group_type ?? row.group_type,
      duration_min: duration,
      total_distance: totalDistance,
      m_per_min: duration > 0 ? +(totalDistance / duration).toFixed(1) : row.m_per_min,
      speed_zone_1: Number(prev.speed_zone_1 || 0) + Number(row.speed_zone_1 || 0),
      speed_zone_2: Number(prev.speed_zone_2 || 0) + Number(row.speed_zone_2 || 0),
      speed_zone_3: Number(prev.speed_zone_3 || 0) + Number(row.speed_zone_3 || 0),
      speed_zone_4: Number(prev.speed_zone_4 || 0) + Number(row.speed_zone_4 || 0),
      speed_zone_5: Number(prev.speed_zone_5 || 0) + Number(row.speed_zone_5 || 0),
      hsr_distance: Number(prev.hsr_distance || 0) + Number(row.hsr_distance || 0),
      hsr_custom: Number(prev.hsr_custom || 0) + Number(row.hsr_custom || 0),
      sprint_distance: Number(prev.sprint_distance || 0) + Number(row.sprint_distance || 0),
      sprint_custom: Number(prev.sprint_custom || 0) + Number(row.sprint_custom || 0),
      sprint_count: Number(prev.sprint_count || 0) + Number(row.sprint_count || 0),
      sprint_count_custom: Number(prev.sprint_count_custom || 0) + Number(row.sprint_count_custom || 0),
      acc_count: Number(prev.acc_count || 0) + Number(row.acc_count || 0),
      dec_count: Number(prev.dec_count || 0) + Number(row.dec_count || 0),
      acd_load: Number(prev.acd_load || 0) + Number(row.acd_load || 0),
      max_speed: Math.max(Number(prev.max_speed || 0), Number(row.max_speed || 0)),
      daily_training_load: combinedLoad,
      rpe: duration > 0 && combinedLoad != null ? +(combinedLoad / duration).toFixed(1) : row.rpe,
    };
  });

  const { error } = await client
    .from('training_daily')
    .upsert(mergedRows, { onConflict: 'player_id,training_date' });
  if (error) throw error;

  await recalculatePlayerAcwr(playerIds);
}

export async function importMatchCsvRows(rows: ParsedDailyRow[], filename: string, seasonYear: number, overrides?: Map<string, string>) {
  const matchInfo = parseMatchFilename(filename);
  if (!matchInfo) throw new Error('파일명에서 경기 정보를 추출할 수 없습니다. (형식: 날짜-대회-상대.csv)');

  const { date, event_type, opponent } = matchInfo;
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows, seasonYear, overrides);
  const now = new Date().toISOString();

  const allPlayerIds = [...new Set([...playerMap.values()])] as string[];
  const { data: playerMeta } = await client
    .from('players')
    .select('id, grade, position')
    .in('id', allPlayerIds);
  const metaMap = new Map((playerMeta ?? []).map((p: any) => [p.id as string, p as { grade: string; position: string }]));

  // K리그주니어는 대회 규정상 경기당 단일 연령대로만 출전하므로, 상대팀명에 포함된 연령(예: "울산U15")이
  // 선수 본인 학년보다 신뢰할 수 있는 소속 기준이다 (콜업 선수는 본인 학년이 아니라 뛴 경기의 연령으로 집계).
  // U16처럼 우리 팀에 없는 연령이 상대팀명에 있는 경우(합동 연습경기 등)는 선수 본인 학년으로 판단한다.
  const opponentGroupMatch = /U(1[3-5])/.exec(opponent);
  const opponentGroup = normalizeEventTypeForGroup(event_type) === 'k리그주니어' && opponentGroupMatch
    ? `U${opponentGroupMatch[1]}`
    : null;

  const matchRows = validRows.map(row => {
    const playerId = playerMap.get(normalizeName(row.player_name));
    const meta = playerId ? metaMap.get(playerId) : undefined;
    const playerGroup = opponentGroup ?? (meta?.grade ? (GRADE_TO_GROUP[meta.grade] ?? null) : null);
    return {
      id: crypto.randomUUID(),
      player_id: playerId,
      match_date: date,
      opponent,
      event_type,
      player_group: playerGroup,
      position_played: meta?.position ?? null,
      play_time_min: row.duration_min,
      rpe: row.rpe,
      total_distance: row.total_distance,
      speed_zone_1: row.speed_zone_1,
      speed_zone_2: row.speed_zone_2,
      speed_zone_3: row.speed_zone_3,
      speed_zone_4: row.speed_zone_4,
      speed_zone_5: row.speed_zone_5,
      m_per_min: row.m_per_min,
      hsr_distance: row.hsr_distance,
      sprint_distance: row.sprint_distance,
      sprint_count: row.sprint_count,
      acc_count: row.acc_count,
      dec_count: row.dec_count,
      acd_load: row.acd_load,
      max_speed: row.max_speed,
      action_count: row.acc_count + row.dec_count,
      created_at: now,
    };
  }).filter(row => row.player_id);

  if (matchRows.length === 0) return matchRows.length;

  const { error: matchError } = await client
    .from('match_data')
    .upsert(matchRows, { onConflict: 'player_id,match_date,opponent' });
  if (matchError) throw matchError;

  // 예전엔 여기서 training_daily에도 미러링해서 저장했으나, 이 미러링이 조용히 실패하는
  // 경우가 있어(경기 35건 중 10건 누락 발견) 제거했다. 대신 training_daily를 읽는 쪽에서
  // match_data를 함께 조회해 합산하도록 통일한다(fetchMatchLoadMap 참고).
  await recalculatePlayerAcwr([...new Set(matchRows.map(r => r.player_id as string))]);

  return matchRows.length;
}

// match_data(경기 GPS 기록)의 TL을 player_id+날짜 기준으로 계산해서 돌려주는 공용 헬퍼.
// training_daily만 읽으면 경기일 부하가 통째로 빠지므로, TL을 다루는 모든 집계 함수는
// 이 헬퍼로 얻은 경기 부하를 training_daily의 daily_training_load와 합산해야 한다.
async function fetchMatchTlByPlayerDate(playerIds: string[]): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map();
  const client = requireSupabase();
  const { data } = await client
    .from('match_data')
    .select('player_id, match_date, play_time_min, rpe')
    .in('player_id', playerIds);

  const map = new Map<string, number>();
  for (const r of (data as R[]) ?? []) {
    const dur = Number(r.play_time_min) || 0;
    const rpe = Number(r.rpe) || 0;
    if (dur > 0 && rpe > 0) {
      const key = `${r.player_id as string}_${r.match_date as string}`;
      map.set(key, (map.get(key) ?? 0) + dur * rpe);
    }
  }
  return map;
}

export async function recalculatePlayerAcwr(playerIds: string[]) {
  const client = requireSupabase();
  const matchTlMap = await fetchMatchTlByPlayerDate(playerIds);

  for (const playerId of playerIds) {
    const { data, error } = await client
      .from('training_daily')
      .select('training_date, daily_training_load')
      .eq('player_id', playerId)
      .order('training_date', { ascending: true });
    if (error) throw error;

    const loadByDate = new Map<string, number>();
    for (const row of (data as R[]) ?? []) {
      if (row.daily_training_load !== null) {
        loadByDate.set(String(row.training_date), Number(row.daily_training_load) || 0);
      }
    }
    // 경기일 부하(match_data)를 같은 날짜의 훈련 부하에 더한다.
    for (const [key, tl] of matchTlMap) {
      if (!key.startsWith(`${playerId}_`)) continue;
      const date = key.slice(playerId.length + 1);
      loadByDate.set(date, (loadByDate.get(date) ?? 0) + tl);
    }
    if (loadByDate.size === 0) continue;

    const sortedDates = [...loadByDate.keys()].sort();
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const startDate = new Date(sortedDates[0]);
    const endDate = new Date(sortedDates[sortedDates.length - 1]);
    const acwrRows = [];
    let prevAcute: number | null = null;
    let prevChronic: number | null = null;
    let dayCount = 0;

    for (const d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = toLocalDateStr(d);
      const load = loadByDate.get(dateStr) ?? 0;
      const acute = calculateAcuteEwma(load, prevAcute);
      const chronic = calculateChronicEwma(load, prevChronic);
      const acwr = calculateAcwr(acute, chronic);
      dayCount++;

      acwrRows.push({
        id: crypto.randomUUID(),
        player_id: playerId,
        date: dateStr,
        daily_load: load,
        acute_ewma: acute,
        chronic_ewma: chronic,
        acwr,
        data_sufficient: dayCount >= 21,
        created_at: new Date().toISOString(),
      });

      prevAcute = acute;
      prevChronic = chronic;
    }

    const { error: upsertError } = await client
      .from('acwr_daily')
      .upsert(acwrRows, { onConflict: 'player_id,date' });
    if (upsertError) throw upsertError;
  }
}

export async function fetchPlayersWithAcwr(): Promise<PlayerWithAcwr[]> {
  if (!supabase) return [];

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .order('name');

  if (!players) return [];

  const { data: latestRow } = await supabase
    .from('acwr_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);

  const latestDate = (latestRow as R[])?.[0]?.date ?? '';

  const { data: latestAcwr } = await supabase
    .from('acwr_daily')
    .select('*')
    .eq('date', latestDate);

  const { data: recentDaily } = await supabase
    .from('training_daily')
    .select('player_id, daily_training_load, training_date')
    .not('daily_training_load', 'is', null)
    .order('training_date', { ascending: false })
    .limit(players.length * 7);

  return (players as R[]).map(player => {
    const acwr = (latestAcwr as R[])?.find(a => a.player_id === player.id);
    const playerDailyLoads = (recentDaily as R[] ?? [])
      .filter(d => d.player_id === player.id)
      .slice(0, 7)
      .map(d => d.daily_training_load as number);

    const monotony = calculateMonotony(playerDailyLoads);
    const zone: AcwrZone = acwr
      ? getAcwrZone(acwr.acwr, acwr.data_sufficient, player.maturity_status ?? 'Mid')
      : 'insufficient';

    return { ...player, acwr_data: acwr, acwr_zone: zone, monotony } as PlayerWithAcwr;
  });
}

export async function fetchPlayersForSidebar(): Promise<SidebarPlayer[]> {
  if (!supabase) return [];

  const { data: players } = await supabase
    .from('players')
    .select('id, name, maturity_status')
    .order('name');
  if (!players) return [];

  const { data: latestRow } = await supabase
    .from('acwr_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);
  const latestDate = (latestRow as R[])?.[0]?.date;

  const acwrMap = new Map<string, R>();
  if (latestDate) {
    const { data: acwrRows } = await supabase
      .from('acwr_daily')
      .select('player_id, acwr, data_sufficient')
      .eq('date', latestDate);
    for (const row of (acwrRows as R[]) ?? []) acwrMap.set(row.player_id, row);
  }

  const activeIds = new Set<string>();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk } = await supabase
      .from('training_daily')
      .select('player_id')
      .range(offset, offset + PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    for (const row of chunk as R[]) activeIds.add(row.player_id);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  return (players as R[])
    .filter(p => activeIds.has(p.id))
    .map(p => {
      const acwr = acwrMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        acwr: acwr ? Number(acwr.acwr) : null,
        zone: acwr
          ? getAcwrZone(Number(acwr.acwr), acwr.data_sufficient, p.maturity_status ?? 'Mid')
          : 'insufficient' as AcwrZone,
      };
    });
}

export async function fetchTeamDailyAggregates(days = 90): Promise<TeamDailyAggregate[]> {
  if (!supabase) return [];

  const playerIds = await fetchPlayerIds();
  if (playerIds.length === 0) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const allRows: R[] = [];
  let offset = 0;
  const PAGE = 1000;
  const cutoffStr = cutoff.toISOString().split('T')[0];
  while (true) {
    const { data: chunk } = await supabase
      .from('training_daily')
      .select('training_date, total_distance, hsr_distance, sprint_distance, rpe')
      .in('player_id', playerIds)
      .gte('training_date', cutoffStr)
      .order('training_date')
      .range(offset, offset + PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    allRows.push(...(chunk as R[]));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  const data = allRows;
  if (!data.length) return [];

  const grouped = new Map<string, { td: number[]; hsr: number[]; sprint: number[]; rpe: number[] }>();

  for (const row of data as R[]) {
    const date = row.training_date;
    if (!grouped.has(date)) grouped.set(date, { td: [], hsr: [], sprint: [], rpe: [] });
    const g = grouped.get(date)!;
    if (row.total_distance != null) g.td.push(Number(row.total_distance));
    if (row.hsr_distance != null) g.hsr.push(Number(row.hsr_distance));
    if (row.sprint_distance != null) g.sprint.push(Number(row.sprint_distance));
    if (row.rpe != null && Number(row.rpe) > 0) g.rpe.push(Number(row.rpe));
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return Array.from(grouped.entries()).map(([date, g]) => ({
    date,
    td_mean: avg(g.td),
    hsr_mean: avg(g.hsr),
    sprint_mean: avg(g.sprint),
    rpe_mean: avg(g.rpe),
    player_count: g.td.length,
  }));
}

// 홈 화면 캘린더용 — 실제 업로드된 훈련/경기 로우데이터를 날짜별로 요약
export interface CalendarEvent {
  date: string;
  type: 'training' | 'match';
  label: string;
}

export async function fetchCalendarEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
  if (!supabase) return [];

  const { data: dailyRows } = await supabase
    .from('training_daily')
    .select('training_date, player_id')
    .gte('training_date', startDate)
    .lte('training_date', endDate);

  const { data: matchRows } = await supabase
    .from('match_data')
    .select('match_date, opponent, event_type')
    .gte('match_date', startDate)
    .lte('match_date', endDate);

  const trainingCountByDate = new Map<string, number>();
  for (const r of (dailyRows as R[] ?? [])) {
    const date = r.training_date as string;
    trainingCountByDate.set(date, (trainingCountByDate.get(date) ?? 0) + 1);
  }

  const matchByDate = new Map<string, Set<string>>();
  for (const r of (matchRows as R[] ?? [])) {
    const date = r.match_date as string;
    const label = `${r.event_type as string} vs ${r.opponent as string}`;
    if (!matchByDate.has(date)) matchByDate.set(date, new Set());
    matchByDate.get(date)!.add(label);
  }

  const events: CalendarEvent[] = [];
  for (const [date, count] of trainingCountByDate) {
    events.push({ date, type: 'training', label: `훈련 ${count}명` });
  }
  for (const [date, labels] of matchByDate) {
    for (const label of labels) events.push({ date, type: 'match', label });
  }
  return events;
}

export async function fetchAvailableDates(): Promise<string[]> {
  if (!supabase) return [];

  const playerIds = await fetchPlayerIds();
  if (playerIds.length === 0) return [];

  const dates = new Set<string>();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk } = await supabase
      .from('training_daily')
      .select('training_date')
      .in('player_id', playerIds)
      .order('training_date', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    for (const row of chunk as R[]) dates.add(row.training_date);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }
  return [...dates].sort().reverse();
}

export async function fetchDailyReportData(date: string): Promise<DailyReportRow[]> {
  if (!supabase) return [];

  const playerIds = await fetchPlayerIds();
  if (playerIds.length === 0) return [];

  const { data } = await supabase
    .from('training_daily')
    .select('player_id, group_type, duration_min, total_distance, m_per_min, hsr_distance, hsr_custom, sprint_distance, sprint_custom, sprint_count, sprint_count_custom, acc_count, dec_count, acd_load, max_speed, rpe, daily_training_load, players(name, jersey_number, position)')
    .eq('training_date', date)
    .in('player_id', playerIds);

  // 경기일엔 training_daily에 아무 기록이 없을 수 있으므로 match_data도 함께 조회해 합산한다.
  const { data: matchData } = await supabase
    .from('match_data')
    .select('player_id, player_group, play_time_min, total_distance, m_per_min, hsr_distance, sprint_distance, sprint_count, acc_count, dec_count, acd_load, max_speed, rpe, players(name, jersey_number, position)')
    .eq('match_date', date)
    .in('player_id', playerIds);

  const rows = new Map<string, DailyReportRow>();
  for (const row of (data as R[]) ?? []) {
    rows.set(row.player_id as string, {
      player_id: row.player_id as string,
      group_type: (row.group_type as string) ?? null,
      player_name: row.players?.name ?? '',
      jersey_number: row.players?.jersey_number,
      position: row.players?.position,
      duration_min: Number(row.duration_min) || 0,
      total_distance: Number(row.total_distance) || 0,
      m_per_min: Number(row.m_per_min) || 0,
      hsr_distance: Number(row.hsr_distance) || 0,
      hsr_custom: Number(row.hsr_custom) || 0,
      sprint_distance: Number(row.sprint_distance) || 0,
      sprint_custom: Number(row.sprint_custom) || 0,
      sprint_count: Number(row.sprint_count) || 0,
      sprint_count_custom: Number(row.sprint_count_custom) || 0,
      acc_count: Number(row.acc_count) || 0,
      dec_count: Number(row.dec_count) || 0,
      acd_load: Number(row.acd_load) || 0,
      max_speed: Number(row.max_speed) || 0,
      rpe: row.rpe != null ? Number(row.rpe) : null,
      daily_training_load: row.daily_training_load != null ? Number(row.daily_training_load) : null,
    });
  }
  for (const row of (matchData as R[]) ?? []) {
    const playerId = row.player_id as string;
    const dur = Number(row.play_time_min) || 0;
    const rpe = row.rpe != null ? Number(row.rpe) : null;
    const tl = (dur > 0 && rpe != null && rpe > 0) ? dur * rpe : null;
    const prev = rows.get(playerId);
    if (prev) {
      rows.set(playerId, {
        ...prev,
        duration_min: prev.duration_min + dur,
        total_distance: prev.total_distance + (Number(row.total_distance) || 0),
        m_per_min: Number(row.m_per_min) || prev.m_per_min,
        hsr_distance: prev.hsr_distance + (Number(row.hsr_distance) || 0),
        sprint_distance: prev.sprint_distance + (Number(row.sprint_distance) || 0),
        sprint_count: prev.sprint_count + (Number(row.sprint_count) || 0),
        acc_count: prev.acc_count + (Number(row.acc_count) || 0),
        dec_count: prev.dec_count + (Number(row.dec_count) || 0),
        acd_load: prev.acd_load + (Number(row.acd_load) || 0),
        max_speed: Math.max(prev.max_speed, Number(row.max_speed) || 0),
        rpe: rpe ?? prev.rpe,
        daily_training_load: (tl ?? 0) + (prev.daily_training_load ?? 0) || null,
      });
    } else {
      rows.set(playerId, {
        player_id: playerId,
        group_type: (row.player_group as string) ?? null,
        player_name: row.players?.name ?? '',
        jersey_number: row.players?.jersey_number,
        position: row.players?.position,
        duration_min: dur,
        total_distance: Number(row.total_distance) || 0,
        m_per_min: Number(row.m_per_min) || 0,
        hsr_distance: Number(row.hsr_distance) || 0,
        hsr_custom: 0,
        sprint_distance: Number(row.sprint_distance) || 0,
        sprint_custom: 0,
        sprint_count: Number(row.sprint_count) || 0,
        sprint_count_custom: 0,
        acc_count: Number(row.acc_count) || 0,
        dec_count: Number(row.dec_count) || 0,
        acd_load: Number(row.acd_load) || 0,
        max_speed: Number(row.max_speed) || 0,
        rpe,
        daily_training_load: tl,
      });
    }
  }

  return [...rows.values()].sort((a, b) => b.total_distance - a.total_distance);
}

// 하루에 운동부하 CSV가 오전/오후처럼 여러 번 업로드된 날짜의 세션별 리포트.
// training_daily는 합산된 값만 남기 때문에, 세션 단위 원본은 csv_uploads에 저장된 csv_content를 그때그때 다시 파싱해서 보여준다.
export interface DailySessionReport {
  label: string;
  rows: DailyReportRow[];
}

export async function fetchDailySessionReports(date: string): Promise<DailySessionReport[]> {
  const client = requireSupabase();
  const { data: uploads } = await client
    .from('csv_uploads')
    .select('filename, csv_content, created_at')
    .eq('training_date', date)
    .eq('file_type', 'daily')
    .order('created_at', { ascending: true });

  if (!uploads || uploads.length < 2) return [];

  const { data: players } = await client
    .from('players')
    .select('id, name, jersey_number, position, grade');
  const playerMap = new Map((players ?? []).map((p: any) => [normalizeName(p.name as string), p]));

  const sheetRpe = await fetchGoogleSheetRpe();
  const sheetRpeMap = new Map(sheetRpe.filter(s => s.date === date).map(s => [`${s.session}|${normalizeName(s.name)}`, s.rpe]));

  const { data: manualRpe } = await client
    .from('session_rpe_manual')
    .select('session, player_id, rpe')
    .eq('training_date', date);
  const manualRpeMap = new Map((manualRpe as R[] ?? []).map(m => [`${m.session}|${m.player_id}`, Number(m.rpe)]));

  const { data: manualGroup } = await client
    .from('session_group_manual')
    .select('session, player_id, group_type')
    .eq('training_date', date);
  const manualGroupMap = new Map((manualGroup as R[] ?? []).map(m => [`${m.session}|${m.player_id}`, m.group_type as string]));

  return (uploads as R[]).map(u => {
    const filename = u.filename as string;
    const normalizedFilename = filename.normalize('NFC');
    const label = normalizedFilename.includes('오전') ? '오전' : normalizedFilename.includes('오후') ? '오후' : filename;

    const parsed = parseDailyCsv(u.csv_content as string);
    const rows: DailyReportRow[] = parsed.filter(r => normalizeName(r.player_name)).map(r => {
      const meta = playerMap.get(normalizeName(r.player_name));
      const sheetValue = sheetRpeMap.get(`${label}|${normalizeName(r.player_name)}`);
      const manualValue = meta?.id ? manualRpeMap.get(`${label}|${meta.id}`) : undefined;
      const rpe = sheetValue ?? manualValue ?? r.rpe;
      const dailyTrainingLoad = rpe !== null && rpe !== undefined ? r.duration_min * rpe : null;
      const manualGroupValue = meta?.id ? manualGroupMap.get(`${label}|${meta.id}`) : undefined;
      return {
        player_id: meta?.id ?? '',
        group_type: manualGroupValue ?? (meta?.grade ? (GRADE_TO_GROUP[meta.grade as string] ?? null) : null),
        player_name: r.player_name,
        jersey_number: meta?.jersey_number ?? null,
        position: meta?.position ?? null,
        duration_min: r.duration_min,
        total_distance: r.total_distance,
        m_per_min: r.m_per_min,
        hsr_distance: r.hsr_distance,
        hsr_custom: r.hsr_custom,
        sprint_distance: r.sprint_distance,
        sprint_custom: r.sprint_custom,
        sprint_count: r.sprint_count,
        sprint_count_custom: r.sprint_count_custom,
        acc_count: r.acc_count,
        dec_count: r.dec_count,
        acd_load: r.acd_load,
        max_speed: r.max_speed,
        rpe: rpe ?? null,
        daily_training_load: dailyTrainingLoad,
      };
    }).filter(r => r.player_id);

    return { label, rows: rows.sort((a, b) => b.total_distance - a.total_distance) };
  });
}

export interface RawDataSessionReport {
  label: string;
  rows: RawDataRow[];
}

export async function fetchDatesWithMultipleSessions(): Promise<Set<string>> {
  const client = requireSupabase();
  const { data } = await client
    .from('csv_uploads')
    .select('training_date')
    .eq('file_type', 'daily');
  const counts = new Map<string, number>();
  for (const row of (data as R[]) ?? []) {
    const date = row.training_date as string;
    if (!date) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, c]) => c >= 2).map(([date]) => date));
}

export async function fetchRawDataSessionsByDate(date: string): Promise<RawDataSessionReport[]> {
  const client = requireSupabase();
  const { data: uploads } = await client
    .from('csv_uploads')
    .select('filename, csv_content, created_at')
    .eq('training_date', date)
    .eq('file_type', 'daily')
    .order('created_at', { ascending: true });

  if (!uploads || uploads.length < 2) return [];

  const { data: players } = await client
    .from('players')
    .select('id, name, jersey_number');
  const playerMap = new Map((players ?? []).map((p: any) => [normalizeName(p.name as string), p]));

  const { data: manualRpe } = await client
    .from('session_rpe_manual')
    .select('session, player_id, rpe')
    .eq('training_date', date);
  const manualRpeMap = new Map((manualRpe as R[] ?? []).map(m => [`${m.session}|${m.player_id}`, Number(m.rpe)]));

  const { data: manualGroup } = await client
    .from('session_group_manual')
    .select('session, player_id, group_type')
    .eq('training_date', date);
  const manualGroupMap = new Map((manualGroup as R[] ?? []).map(m => [`${m.session}|${m.player_id}`, m.group_type as string]));

  return (uploads as R[]).map(u => {
    const filenameForLabel = (u.filename as string).normalize('NFC');
    const sessionLabel = filenameForLabel.includes('오전') ? '오전' : filenameForLabel.includes('오후') ? '오후' : filenameForLabel;

    const parsed = parseDailyCsv(u.csv_content as string);
    const rows: RawDataRow[] = parsed.filter(r => normalizeName(r.player_name)).map(r => {
      const meta = playerMap.get(normalizeName(r.player_name));
      const manualRpeValue = meta?.id ? manualRpeMap.get(`${sessionLabel}|${meta.id}`) : undefined;
      const manualGroupValue = meta?.id ? manualGroupMap.get(`${sessionLabel}|${meta.id}`) : undefined;
      return {
        id: crypto.randomUUID(),
        player_id: meta?.id ?? '',
        training_date: date,
        player_name: r.player_name,
        jersey_number: meta?.jersey_number ?? null,
        group_type: manualGroupValue ?? null,
        rpe: manualRpeValue ?? r.rpe,
        duration_min: r.duration_min,
        total_distance: r.total_distance,
        m_per_min: r.m_per_min,
        hsr_distance: r.hsr_distance,
        hsr_custom: r.hsr_custom,
        sprint_distance: r.sprint_distance,
        sprint_custom: r.sprint_custom,
        sprint_count: r.sprint_count,
        sprint_count_custom: r.sprint_count_custom,
        acc_count: r.acc_count,
        dec_count: r.dec_count,
        acd_load: r.acd_load,
        max_speed: r.max_speed,
        speed_zone_1: r.speed_zone_1,
        speed_zone_2: r.speed_zone_2,
        speed_zone_3: r.speed_zone_3,
        speed_zone_4: r.speed_zone_4,
        speed_zone_5: r.speed_zone_5,
      };
    }).filter(r => r.player_id);

    return { label: sessionLabel, rows: rows.sort((a, b) => b.total_distance - a.total_distance) };
  });
}

// 세션별(오전/오후) RPE·그룹 수정 후, 두 세션을 합산한 하루 기록(training_daily)에도
// 반영해 데일리 리포트 합산 뷰·주간 리포트·ACWR/Monotony가 기존 방식과 동일하게 갱신되도록 한다.
async function recomputeMergedTrainingDaily(date: string, playerId: string) {
  const client = requireSupabase();
  const sessions = await fetchRawDataSessionsByDate(date);
  if (sessions.length === 0) return;

  const sheetRpe = await fetchGoogleSheetRpe();
  const sheetMap = new Map(sheetRpe.filter(s => s.date === date).map(s => [`${s.session}|${normalizeName(s.name)}`, s.rpe]));

  let totalDuration = 0;
  let totalLoad = 0;
  let hasAnyRpe = false;
  for (const s of sessions) {
    const row = s.rows.find(r => r.player_id === playerId);
    if (!row) continue;
    totalDuration += row.duration_min;
    const sheetValue = sheetMap.get(`${s.label}|${normalizeName(row.player_name)}`);
    const rpe = sheetValue ?? row.rpe;
    if (rpe != null) {
      totalLoad += rpe * row.duration_min;
      hasAnyRpe = true;
    }
  }
  if (totalDuration === 0 || !hasAnyRpe) return;
  const rpe = +(totalLoad / totalDuration).toFixed(1);

  const { data: existing } = await client
    .from('training_daily')
    .select('id')
    .eq('training_date', date)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!existing) return;
  await updateRpe((existing as R).id as string, rpe);
}

export async function upsertSessionRpe(trainingDate: string, session: '오전' | '오후', playerId: string, rpe: number) {
  const client = requireSupabase();
  const { error } = await client
    .from('session_rpe_manual')
    .upsert({ training_date: trainingDate, session, player_id: playerId, rpe }, { onConflict: 'training_date,session,player_id' });
  if (error) throw error;
  await recomputeMergedTrainingDaily(trainingDate, playerId);
}

export async function upsertSessionGroup(trainingDate: string, session: '오전' | '오후', playerId: string, groupType: string) {
  const client = requireSupabase();
  const { error } = await client
    .from('session_group_manual')
    .upsert({ training_date: trainingDate, session, player_id: playerId, group_type: groupType }, { onConflict: 'training_date,session,player_id' });
  if (error) throw error;

  const { data: existing } = await client
    .from('training_daily')
    .select('id')
    .eq('training_date', trainingDate)
    .eq('player_id', playerId)
    .maybeSingle();
  if (existing) await updateGroupType((existing as R).id as string, groupType);
}

export async function fetchPlayerAcwrHistory(playerId: string): Promise<AcwrDaily[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('acwr_daily')
    .select('*')
    .eq('player_id', playerId)
    .order('date', { ascending: true });
  return (data ?? []) as AcwrDaily[];
}

export async function fetchPlayerDailyData(playerId: string): Promise<TrainingDaily[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('training_daily')
    .select('*')
    .eq('player_id', playerId)
    .order('training_date', { ascending: false })
    .limit(60);
  return (data ?? []) as TrainingDaily[];
}

export async function fetchPlayerMatchHistory(playerId: string): Promise<MatchData[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('match_data')
    .select('*')
    .eq('player_id', playerId)
    .order('match_date', { ascending: false });
  return (data ?? []) as MatchData[];
}

export async function fetchRpeData(): Promise<{
  teamTrend: TeamDailyAggregate[];
  playerAvgs: { name: string; avg_rpe: number; sessions: number; player_id: string }[];
  distribution: number[];
}> {
  if (!supabase) return { teamTrend: [], playerAvgs: [], distribution: [] };

  const playerIds = await fetchPlayerIds();
  if (playerIds.length === 0) return { teamTrend: [], playerAvgs: [], distribution: [] };

  const rows: R[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk } = await supabase
      .from('training_daily')
      .select('training_date, rpe, player_id, players(name)')
      .in('player_id', playerIds)
      .not('rpe', 'is', null)
      .gt('rpe', 0)
      .order('training_date')
      .range(offset, offset + PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    rows.push(...(chunk as R[]));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  // 경기일 RPE(match_data)도 같이 반영한다 — training_daily만 보면 경기 RPE가 누락된다.
  const { data: matchRpeRows } = await supabase
    .from('match_data')
    .select('match_date, rpe, player_id, players(name)')
    .in('player_id', playerIds)
    .not('rpe', 'is', null)
    .gt('rpe', 0);
  for (const row of (matchRpeRows as R[]) ?? []) {
    rows.push({ training_date: row.match_date, rpe: row.rpe, player_id: row.player_id, players: row.players });
  }

  if (!rows.length) return { teamTrend: [], playerAvgs: [], distribution: [] };
  rows.sort((a, b) => String(a.training_date).localeCompare(String(b.training_date)));

  const byDate = new Map<string, number[]>();
  const byPlayer = new Map<string, { name: string; rpes: number[]; id: string }>();
  const bins = new Array(10).fill(0);

  for (const row of rows) {
    const rpe = Number(row.rpe);
    const date = row.training_date;
    const pid = row.player_id;
    const pname = row.players?.name ?? '';

    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(rpe);

    if (!byPlayer.has(pid)) byPlayer.set(pid, { name: pname, rpes: [], id: pid });
    byPlayer.get(pid)!.rpes.push(rpe);

    const bin = Math.min(Math.round(rpe) - 1, 9);
    if (bin >= 0) bins[bin]++;
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const teamTrend = Array.from(byDate.entries())
    .slice(-60)
    .map(([date, rpes]) => ({
      date,
      td_mean: 0, hsr_mean: 0, sprint_mean: 0,
      rpe_mean: avg(rpes),
      player_count: rpes.length,
    }));

  const playerAvgs = Array.from(byPlayer.values())
    .map(p => ({ name: p.name, avg_rpe: +avg(p.rpes).toFixed(1), sessions: p.rpes.length, player_id: p.id }))
    .sort((a, b) => b.avg_rpe - a.avg_rpe);

  return { teamTrend, playerAvgs, distribution: bins };
}

export interface CsvUploadRecord {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  row_count: number;
  training_date: string | null;
  csv_content: string;
  created_at: string;
}

export async function saveCsvUploadRecord(
  record: Omit<CsvUploadRecord, 'id' | 'created_at'>,
) {
  const client = requireSupabase();
  const { error } = await client.from('csv_uploads').insert(record);
  if (error) throw error;
}

export async function fetchCsvUploads(): Promise<CsvUploadRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('csv_uploads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CsvUploadRecord[];
}

export async function deleteCsvUpload(id: string) {
  const client = requireSupabase();

  const { data: record } = await client.from('csv_uploads').select('*').eq('id', id).single();
  if (!record) return;

  const { file_type, training_date, filename, csv_content } = record as CsvUploadRecord;

  if (training_date && csv_content) {
    const playerNames = extractPlayerNamesFromCsv(csv_content, file_type);
    if (playerNames.length > 0) {
      const playerIds = await resolvePlayerIds(playerNames);
      if (playerIds.length > 0) {
        if (file_type === 'daily' || file_type === 'match') {
          await client.from('training_daily')
            .delete()
            .eq('training_date', training_date)
            .in('player_id', playerIds);
        }
        if (file_type === 'match') {
          const matchInfo = parseMatchFilename(filename);
          if (matchInfo) {
            await client.from('match_data')
              .delete()
              .eq('match_date', training_date)
              .eq('opponent', matchInfo.opponent)
              .in('player_id', playerIds);
          }
        }
        if (file_type === 'match_session') {
          const sessionInfo = parseMatchSessionFilename(filename);
          if (sessionInfo) {
            const opponent = sessionInfo.opponent || await getOpponentByDate(training_date);
            if (opponent) {
              await client.from('match_session_data')
                .delete()
                .eq('match_date', training_date)
                .eq('opponent', opponent)
                .in('player_id', playerIds);
            }
          }
        }
        if (file_type === 'daily' || file_type === 'match') {
          await recalculatePlayerAcwr(playerIds);
        }
      }
    }
  }

  const { error } = await client.from('csv_uploads').delete().eq('id', id);
  if (error) throw error;
}

function extractPlayerNamesFromCsv(csv: string, fileType: string): string[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const nameCol = (fileType === 'match_session') ? 1 : 0;
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return normalizeName(cols[nameCol] || '');
  }).filter(Boolean);
}

async function resolvePlayerIds(names: string[]): Promise<string[]> {
  const client = requireSupabase();
  const unique = [...new Set(names)];
  const { data } = await client.from('players').select('id, name');
  if (!data) return [];
  const map = new Map((data as R[]).map(p => [normalizeName(String(p.name)), String(p.id)]));
  return unique.map(n => map.get(n)).filter(Boolean) as string[];
}

async function getOpponentByDate(date: string): Promise<string> {
  const client = requireSupabase();
  const { data } = await client.from('match_data').select('opponent').eq('match_date', date).limit(1);
  return (data as R[])?.[0]?.opponent as string ?? '';
}

export interface MatchRow {
  match_date: string;
  opponent: string;
  event_type: string;
  player_group: string | null;
  position_played: string | null;
  play_time_min: number;
  total_distance: number;
  m_per_min: number;
  hsr_distance: number;
  sprint_distance: number;
  acc_count: number;
  dec_count: number;
  acd_load: number;
  max_speed: number;
  action_count: number;
  player_name: string;
}

export async function fetchMatchData(): Promise<MatchRow[]> {
  const client = requireSupabase();
  const { data } = await client
    .from('match_data')
    .select('match_date, opponent, event_type, player_group, position_played, play_time_min, total_distance, m_per_min, hsr_distance, sprint_distance, acc_count, dec_count, acd_load, max_speed, action_count, players(name)')
    .order('match_date', { ascending: true });
  return ((data ?? []) as R[]).map(row => ({
    match_date: row.match_date as string,
    opponent: row.opponent as string,
    event_type: row.event_type as string,
    player_group: row.player_group as string | null,
    position_played: row.position_played as string | null,
    play_time_min: Number(row.play_time_min) || 0,
    total_distance: Number(row.total_distance) || 0,
    m_per_min: Number(row.m_per_min) || 0,
    hsr_distance: Number(row.hsr_distance) || 0,
    sprint_distance: Number(row.sprint_distance) || 0,
    acc_count: Number(row.acc_count) || 0,
    dec_count: Number(row.dec_count) || 0,
    acd_load: Number(row.acd_load) || 0,
    max_speed: Number(row.max_speed) || 0,
    action_count: Number(row.action_count) || 0,
    player_name: ((row.players as R)?.name as string) ?? '',
  }));
}

export async function fetchDataSummary() {
  const client = requireSupabase();
  const { data: daily } = await client
    .from('training_daily')
    .select('training_date, player_id')
    .order('training_date', { ascending: true });
  const rows = (daily ?? []) as R[];
  const dates = rows.map(r => r.training_date as string).filter(Boolean);
  const playerIds = new Set(rows.map(r => r.player_id as string));
  return {
    dateRange: dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '-',
    playerCount: playerIds.size,
    sessionCount: rows.length,
  };
}

export async function fetchAllPlayers(): Promise<Player[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('players')
    .select('*')
    .order('jersey_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Player[];
}

export async function fetchSeasonYears(): Promise<number[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('player_seasons').select('season_year');
  if (error) throw error;
  const years = [...new Set(((data as R[]) ?? []).map(r => r.season_year as number))];
  return years.sort((a, b) => b - a);
}

// 특정 시즌 소속 선수만 반환. 등번호/포지션/학년은 해당 시즌 기준 값으로 덮어씀
export async function fetchPlayersBySeason(seasonYear: number): Promise<Player[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('player_seasons')
    .select('jersey_number, grade, position, players(*)')
    .eq('season_year', seasonYear);
  if (error) throw error;

  return ((data as R[]) ?? [])
    .map(row => {
      const player = row.players as R;
      if (!player) return null;
      return {
        ...player,
        jersey_number: row.jersey_number ?? player.jersey_number,
        grade: row.grade ?? player.grade,
        position: row.position ?? player.position,
      } as Player;
    })
    .filter((p): p is Player => p !== null)
    .sort((a, b) => a.jersey_number - b.jersey_number);
}

export async function addPlayer(player: {
  name: string;
  jersey_number: number;
  position: string;
  grade: string;
}, seasonYear: number) {
  const client = requireSupabase();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const { error } = await client.from('players').insert({
    id,
    name: player.name,
    jersey_number: player.jersey_number,
    position: player.position,
    grade: player.grade,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;

  const { error: seasonError } = await client.from('player_seasons').insert({
    player_id: id,
    season_year: seasonYear,
    jersey_number: player.jersey_number,
    grade: player.grade,
    position: player.position,
  });
  if (seasonError) throw seasonError;
}

export async function uploadPlayerPhoto(playerId: string, file: File): Promise<string> {
  const client = requireSupabase();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${playerId}.${ext}`;
  const { error } = await client.storage
    .from('player-photos')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = client.storage.from('player-photos').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;
  await client.from('players').update({ photo_url: url }).eq('id', playerId);
  return url;
}

export async function updatePlayer(id: string, fields: {
  position?: string; grade?: string; jersey_number?: number;
  name?: string; birth_date?: string; current_height?: number;
  current_weight?: number; preferred_foot?: string; photo_url?: string;
}) {
  const client = requireSupabase();
  const { error } = await client
    .from('players')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePlayer(id: string) {
  const client = requireSupabase();
  const { error } = await client.from('players').delete().eq('id', id);
  if (error) throw error;
}

export async function deletePlayers(ids: string[]) {
  const client = requireSupabase();
  const { error } = await client.from('players').delete().in('id', ids);
  if (error) throw error;
}

export interface RawDataRow {
  id: string;
  player_id: string;
  training_date: string;
  player_name: string;
  jersey_number: number | null;
  group_type: string | null;
  rpe: number | null;
  duration_min: number;
  total_distance: number;
  m_per_min: number;
  hsr_distance: number;
  hsr_custom: number;
  sprint_distance: number;
  sprint_custom: number;
  sprint_count: number;
  sprint_count_custom: number;
  acc_count: number;
  dec_count: number;
  acd_load: number;
  max_speed: number;
  speed_zone_1: number;
  speed_zone_2: number;
  speed_zone_3: number;
  speed_zone_4: number;
  speed_zone_5: number;
}

export async function fetchAllTrainingDates(): Promise<string[]> {
  const client = requireSupabase();
  const dates = new Set<string>();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk, error } = await client
      .from('training_daily')
      .select('training_date')
      .order('training_date', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;
    for (const row of chunk as R[]) dates.add(row.training_date as string);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }
  return [...dates].sort().reverse();
}

export async function fetchRawDataByDates(dates: string[]): Promise<RawDataRow[]> {
  if (dates.length === 0) return [];
  const client = requireSupabase();
  const allRows: R[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk, error } = await client
      .from('training_daily')
      .select('id, player_id, training_date, group_type, duration_min, rpe, total_distance, m_per_min, hsr_distance, hsr_custom, sprint_distance, sprint_custom, sprint_count, sprint_count_custom, acc_count, dec_count, acd_load, max_speed, speed_zone_1, speed_zone_2, speed_zone_3, speed_zone_4, speed_zone_5, players(name, jersey_number)')
      .in('training_date', dates)
      .order('training_date', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;
    allRows.push(...(chunk as R[]));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }
  return allRows.map(row => ({
    id: row.id,
    player_id: row.player_id,
    training_date: row.training_date,
    player_name: row.players?.name ?? '',
    jersey_number: row.players?.jersey_number ?? null,
    group_type: row.group_type ?? null,
    rpe: row.rpe != null ? Number(row.rpe) : null,
    duration_min: Number(row.duration_min) || 0,
    total_distance: Number(row.total_distance) || 0,
    m_per_min: Number(row.m_per_min) || 0,
    hsr_distance: Number(row.hsr_distance) || 0,
    hsr_custom: Number(row.hsr_custom) || 0,
    sprint_distance: Number(row.sprint_distance) || 0,
    sprint_custom: Number(row.sprint_custom) || 0,
    sprint_count: Number(row.sprint_count) || 0,
    sprint_count_custom: Number(row.sprint_count_custom) || 0,
    acc_count: Number(row.acc_count) || 0,
    dec_count: Number(row.dec_count) || 0,
    acd_load: Number(row.acd_load) || 0,
    max_speed: Number(row.max_speed) || 0,
    speed_zone_1: Number(row.speed_zone_1) || 0,
    speed_zone_2: Number(row.speed_zone_2) || 0,
    speed_zone_3: Number(row.speed_zone_3) || 0,
    speed_zone_4: Number(row.speed_zone_4) || 0,
    speed_zone_5: Number(row.speed_zone_5) || 0,
  }));
}

export async function updateRpe(id: string, rpe: number) {
  const client = requireSupabase();
  const { data: row, error: fetchErr } = await client
    .from('training_daily')
    .select('duration_min')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;
  const duration = Number((row as R)?.duration_min) || 0;
  const dailyLoad = +(rpe * duration).toFixed(1);
  const { data: updated, error } = await client
    .from('training_daily')
    .update({ rpe, daily_training_load: dailyLoad })
    .eq('id', id)
    .select('player_id')
    .single();
  if (error) throw error;
  await recalculatePlayerAcwr([(updated as R).player_id as string]);
}

export async function updateGroupType(id: string, groupType: string) {
  const client = requireSupabase();
  const { error } = await client
    .from('training_daily')
    .update({ group_type: groupType || null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRawDataRows(ids: string[]) {
  const client = requireSupabase();
  const { error } = await client.from('training_daily').delete().in('id', ids);
  if (error) throw error;
}

export async function fetchWeeklyGradeAvg(weekStart: string, grades: string[]): Promise<{
  date: string; day: string;
  td: number; hsr: number; sprint: number; acc: number; dec: number; acd_load: number; max_speed: number;
  training_load: number;
}[]> {
  const client = requireSupabase();
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  const endStr = endDate.toISOString().split('T')[0];

  const { data: players } = await client
    .from('players')
    .select('id')
    .in('grade', grades);
  if (!players || players.length === 0) return [];
  const playerIds = (players as R[]).map(p => p.id as string);

  const allRows: R[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk } = await client
      .from('training_daily')
      .select('training_date, total_distance, hsr_distance, sprint_distance, acc_count, dec_count, acd_load, max_speed, rpe, duration_min')
      .in('player_id', playerIds)
      .gte('training_date', weekStart)
      .lte('training_date', endStr)
      .range(offset, offset + PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    allRows.push(...(chunk as R[]));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const grouped = new Map<string, R[]>();
  for (const row of allRows) {
    const d = row.training_date as string;
    if (!grouped.has(d)) grouped.set(d, []);
    grouped.get(d)!.push(row);
  }

  const results: {
    date: string; day: string;
    td: number; hsr: number; sprint: number; acc: number; dec: number; acd_load: number; max_speed: number;
    training_load: number;
  }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = dayNames[d.getDay()];
    const rows = grouped.get(dateStr) || [];

    if (rows.length === 0) {
      results.push({ date: dateStr, day: dayName, td: 0, hsr: 0, sprint: 0, acc: 0, dec: 0, acd_load: 0, max_speed: 0, training_load: 0 });
      continue;
    }

    const avg = (arr: R[], key: string) => {
      const vals = arr.map(r => Number(r[key]) || 0);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    const tl = rows.reduce((s, r) => {
      const rpe = Number(r.rpe) || 0;
      const dur = Number(r.duration_min) || 0;
      return s + (rpe > 0 ? rpe * dur : 0);
    }, 0) / rows.filter(r => Number(r.rpe) > 0).length || 0;

    results.push({
      date: dateStr, day: dayName,
      td: Math.round(avg(rows, 'total_distance')),
      hsr: Math.round(avg(rows, 'hsr_distance')),
      sprint: Math.round(avg(rows, 'sprint_distance')),
      acc: Math.round(avg(rows, 'acc_count') * 10) / 10,
      dec: Math.round(avg(rows, 'dec_count') * 10) / 10,
      acd_load: Math.round(avg(rows, 'acd_load')),
      max_speed: Math.round(avg(rows, 'max_speed') * 10) / 10,
      training_load: Math.round(tl),
    });
  }
  return results;
}

export interface WeeklyGpsTotals {
  week_start: string;
  week_label: string;
  td: number;
  hsr: number;
  sprint: number;
  acc: number;
  dec: number;
  acd_load: number;
  training_load: number;
  max_speed: number;
}

function mondayOfDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().split('T')[0];
}

// 로우 데이터(training_daily)에 group_type이 U15 또는 U14로 기입된 모든 기록을 주 단위로 집계
// (선수 현재 학년이 아니라 GPS 업로드 당시 실제 태깅된 그룹 기준 · 주기화표 저장 여부와 무관하게 전체 활용)
export async function fetchWeeklyGpsTotals(): Promise<WeeklyGpsTotals[]> {
  const client = requireSupabase();
  const allRows: R[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk } = await client
      .from('training_daily')
      .select('training_date, total_distance, hsr_distance, sprint_distance, acc_count, dec_count, acd_load, max_speed, rpe, duration_min')
      .in('group_type', ['U15', 'U14'])
      .range(offset, offset + PAGE - 1);
    if (!chunk || chunk.length === 0) break;
    allRows.push(...(chunk as R[]));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }
  if (allRows.length === 0) return [];

  const byDate = new Map<string, R[]>();
  for (const row of allRows) {
    const d = row.training_date as string;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(row);
  }

  const avg = (rows: R[], key: string) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length;

  const dayStats = new Map<string, { td: number; hsr: number; sprint: number; acc: number; dec: number; acd_load: number; max_speed: number; training_load: number }>();
  for (const [date, rows] of byDate) {
    const tlRows = rows.filter(r => Number(r.rpe) > 0);
    const tl = tlRows.length > 0 ? tlRows.reduce((s, r) => s + Number(r.rpe) * Number(r.duration_min), 0) / tlRows.length : 0;
    dayStats.set(date, {
      td: avg(rows, 'total_distance'),
      hsr: avg(rows, 'hsr_distance'),
      sprint: avg(rows, 'sprint_distance'),
      acc: avg(rows, 'acc_count'),
      dec: avg(rows, 'dec_count'),
      acd_load: avg(rows, 'acd_load'),
      max_speed: avg(rows, 'max_speed'),
      training_load: tl,
    });
  }

  const weekMap = new Map<string, string[]>();
  for (const date of dayStats.keys()) {
    const wk = mondayOfDate(date);
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk)!.push(date);
  }

  const savedWeeks = await fetchSavedWeeks();
  const labelMap = new Map(savedWeeks.map(w => [w.week_start, w.week_label]));

  const results: WeeklyGpsTotals[] = [];
  for (const [weekStart, dates] of weekMap) {
    const stats = dates.map(d => dayStats.get(d)!);
    results.push({
      week_start: weekStart,
      week_label: labelMap.get(weekStart) || weekStart,
      td: Math.round(stats.reduce((s, d) => s + d.td, 0)),
      hsr: Math.round(stats.reduce((s, d) => s + d.hsr, 0)),
      sprint: Math.round(stats.reduce((s, d) => s + d.sprint, 0)),
      acc: Math.round(stats.reduce((s, d) => s + d.acc, 0) * 10) / 10,
      dec: Math.round(stats.reduce((s, d) => s + d.dec, 0) * 10) / 10,
      acd_load: Math.round(stats.reduce((s, d) => s + d.acd_load, 0)),
      training_load: Math.round(stats.reduce((s, d) => s + d.training_load, 0)),
      max_speed: Math.round(Math.max(...stats.map(d => d.max_speed)) * 10) / 10,
    });
  }
  results.sort((a, b) => a.week_start.localeCompare(b.week_start));

  return results;
}

export async function saveDailyReportConfig(date: string, playerTypes: Record<string, string>, location: string) {
  const client = requireSupabase();
  const { error } = await client
    .from('daily_report_config')
    .upsert({ training_date: date, player_types: playerTypes, location, updated_at: new Date().toISOString() },
      { onConflict: 'training_date' });
  if (error) throw error;
}

export async function fetchDailyReportConfig(date: string): Promise<{ player_types: Record<string, string>; location: string } | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('daily_report_config')
    .select('player_types, location')
    .eq('training_date', date)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { player_types: (data as R).player_types ?? {}, location: (data as R).location ?? '' };
}

export async function fetchPlayerIds(): Promise<string[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('players').select('id');
  if (error) throw error;
  return (data ?? []).map((r: R) => r.id as string);
}

export interface WeeklyPeriodization {
  id: string;
  week_start: string;
  weekly_topic: string;
  week_label: string;
  days: DayPlan[];
  created_at: string;
  updated_at: string;
}

export interface DayPlan {
  periodization: string;
  perio_code: string;
  physical_goal: string;
  time: string;
  intensity: string;
  training_load: string;
  total_distance: string;
  hsr_distance: string;
  sprint_distance: string;
  acc_dec: string;
  pitch_rect: { x: number; y: number; w: number; h: number };
  prep: string;
  warmup: string;
}

export function emptyDayPlan(): DayPlan {
  return {
    periodization: '', perio_code: '', physical_goal: '',
    time: '', intensity: '', training_load: '',
    total_distance: '', hsr_distance: '', sprint_distance: '',
    acc_dec: '', pitch_rect: { x: 10, y: 10, w: 80, h: 80 },
    prep: '', warmup: '',
  };
}

export async function fetchWeeklyPeriodization(weekStart: string): Promise<WeeklyPeriodization | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('weekly_periodization')
    .select('*')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return data as WeeklyPeriodization | null;
}

export async function upsertWeeklyPeriodization(weekStart: string, weeklyTopic: string, weekLabel: string, days: DayPlan[]) {
  const client = requireSupabase();
  const { error } = await client
    .from('weekly_periodization')
    .upsert({
      week_start: weekStart,
      weekly_topic: weeklyTopic,
      week_label: weekLabel,
      days: days as unknown,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'week_start' });
  if (error) throw error;
}

export async function fetchSavedWeeks(): Promise<{ week_start: string; week_label: string }[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('weekly_periodization')
    .select('week_start, week_label')
    .order('week_start', { ascending: false });
  if (error) throw error;
  return (data ?? []) as { week_start: string; week_label: string }[];
}

export async function fetchDayTarget(date: string): Promise<{ td: number; hsr: number; sprint: number } | null> {
  const parts = date.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const day = d.getDay();
  const mondayDate = new Date(d);
  mondayDate.setDate(d.getDate() - ((day + 6) % 7));
  const weekStart = `${mondayDate.getFullYear()}-${String(mondayDate.getMonth() + 1).padStart(2, '0')}-${String(mondayDate.getDate()).padStart(2, '0')}`;

  const wp = await fetchWeeklyPeriodization(weekStart);
  if (!wp) return null;

  let parsed = wp.days;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed);
  if (!Array.isArray(parsed)) return null;

  const dayIdx = (day + 6) % 7;
  const plan = parsed[dayIdx];
  if (!plan) return null;

  const parseVal = (v: string): number => {
    if (!v) return 0;
    const cleaned = v.replace(/[^0-9.~\-±,]/g, '');
    if (cleaned.includes('~')) {
      const pts = cleaned.split('~').map(Number).filter(n => !isNaN(n));
      return pts.length === 2 ? (pts[0] + pts[1]) / 2 : pts[0] || 0;
    }
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  };

  return {
    td: parseVal(plan.total_distance),
    hsr: parseVal(plan.hsr_distance),
    sprint: parseVal(plan.sprint_distance),
  };
}

export async function fetchMatchDates(): Promise<{ date: string; opponent: string; event_type: string }[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('match_data')
    .select('match_date, opponent, event_type')
    .order('match_date', { ascending: false });
  if (!data) return [];
  const seen = new Set<string>();
  return data.filter(r => {
    const key = `${r.match_date}_${r.opponent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(r => ({ date: r.match_date, opponent: r.opponent, event_type: r.event_type }));
}

export async function fetchMatchReportData(date: string, opponent: string): Promise<MatchReportRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('match_data')
    .select('*, players!inner(name, jersey_number, position)')
    .eq('match_date', date)
    .eq('opponent', opponent);
  if (!data) return [];
  return (data as any[]).map(r => ({
    ...r,
    player_name: r.players?.name ?? '',
    jersey_number: r.players?.jersey_number ?? null,
    position: r.players?.position ?? null,
    players: undefined,
  })) as MatchReportRow[];
}

export async function saveMatchPositions(ids: string[], positions: Record<string, string>): Promise<void> {
  if (!supabase) return;
  const updates = Object.entries(positions)
    .filter(([id]) => ids.includes(id))
    .map(([id, pos]) => supabase!.from('match_data').update({ position_played: pos }).eq('id', id));
  await Promise.all(updates);
}

export async function importMatchSessionCsvRows(rows: ParsedMatchSessionRow[], filename: string, seasonYear: number, overrides?: Map<string, string>): Promise<number> {
  const matchInfo = parseMatchSessionFilename(filename);
  if (!matchInfo) throw new Error('파일명에서 경기 정보를 추출할 수 없습니다. (형식: 날짜-타입-세션별.csv)');

  const { date } = matchInfo;
  let opponent = matchInfo.opponent;
  const client = requireSupabase();

  if (!opponent) {
    const { data: matches } = await client
      .from('match_data')
      .select('opponent')
      .eq('match_date', date)
      .limit(1);
    opponent = matches?.[0]?.opponent ?? '';
    if (!opponent) throw new Error(`${date} 날짜의 경기 데이터가 없습니다. 경기 데이터 CSV를 먼저 업로드해주세요.`);
  }

  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows, seasonYear, overrides);
  const now = new Date().toISOString();

  const sessionRows = validRows.map(row => {
    const playerId = playerMap.get(normalizeName(row.player_name));
    return {
      id: crypto.randomUUID(),
      player_id: playerId,
      match_date: date,
      opponent,
      session_name: row.session_name,
      play_time_min: row.duration_min,
      total_distance: row.total_distance,
      m_per_min: row.m_per_min,
      hsr_distance: row.hsr_distance,
      hsr_custom: row.hsr_custom,
      sprint_distance: row.sprint_distance,
      sprint_custom: row.sprint_custom,
      sprint_count: row.sprint_count,
      sprint_count_custom: row.sprint_count_custom,
      acc_count: row.acc_count,
      dec_count: row.dec_count,
      acd_load: row.acd_load,
      max_speed: row.max_speed,
      action_count: row.acc_count + row.dec_count,
      created_at: now,
    };
  }).filter(row => row.player_id);

  if (sessionRows.length === 0) return 0;

  const { error } = await client
    .from('match_session_data')
    .upsert(sessionRows, { onConflict: 'player_id,match_date,opponent,session_name' });
  if (error) throw error;

  return sessionRows.length;
}

export interface MatchSessionRow {
  session_name: string;
  player_name: string;
  player_id: string;
  total_distance: number;
  m_per_min: number;
  hsr_distance: number;
  sprint_distance: number;
  sprint_count: number;
  acc_count: number;
  dec_count: number;
  acd_load: number;
  max_speed: number;
  play_time_min: number;
}

export async function fetchMatchSessionData(date: string, opponent: string): Promise<MatchSessionRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('match_session_data')
    .select('*, players!inner(name)')
    .eq('match_date', date)
    .eq('opponent', opponent);
  if (!data) return [];
  return (data as any[]).map(r => ({
    session_name: r.session_name,
    player_name: r.players?.name ?? '',
    player_id: r.player_id,
    total_distance: Number(r.total_distance) || 0,
    m_per_min: Number(r.m_per_min) || 0,
    hsr_distance: Number(r.hsr_distance) || 0,
    sprint_distance: Number(r.sprint_distance) || 0,
    sprint_count: Number(r.sprint_count) || 0,
    acc_count: Number(r.acc_count) || 0,
    dec_count: Number(r.dec_count) || 0,
    acd_load: Number(r.acd_load) || 0,
    max_speed: Number(r.max_speed) || 0,
    play_time_min: Number(r.play_time_min) || 0,
  }));
}

export interface TeamAcwrDayData {
  date: string;
  tl: number;
  td: number;
  hsr: number;
  sprint: number;
  acd: number;
}

export interface TeamAcwrSeries {
  date: string;
  daily: number;
  acute: number;
  chronic: number;
  acwr: number;
  n?: number;        // 그날 집계에 포함된 U15 선수 수 (표본 신뢰도 참고용)
  missing?: boolean; // RPE 등 입력 누락으로 실제 부하를 알 수 없어 전날 값으로 대체한 날
  warmup?: boolean;  // 10일 이상 공백(방학 등) 직후 웜업 구간 — EWMA가 아직 안정화되지 않음
  postRest?: boolean;// 전날이 실제 휴식(0)이어서 오늘 값이 급반등으로 보이는 날
}

export async function fetchTeamAcwrData(days: number = 60): Promise<{
  tl: TeamAcwrSeries[];
  td: TeamAcwrSeries[];
  hsr: TeamAcwrSeries[];
  sprint: TeamAcwrSeries[];
  acd: TeamAcwrSeries[];
}> {
  if (!supabase) return { tl: [], td: [], hsr: [], sprint: [], acd: [] };

  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);

  // Fetch training_daily with group_type in chunks (Supabase 1000-row limit)
  const dailyData: any[] = [];
  const chunkSize = 14;
  for (let offset = 0; ; offset += chunkSize) {
    const cStart = new Date(startDate);
    cStart.setDate(startDate.getDate() + offset);
    if (cStart > today) break;
    const cEnd = new Date(startDate);
    cEnd.setDate(startDate.getDate() + offset + chunkSize - 1);
    if (cEnd > today) cEnd.setTime(today.getTime());

    const { data: chunk } = await supabase
      .from('training_daily')
      .select('training_date, player_id, group_type, daily_training_load, duration_min, rpe, total_distance, hsr_distance, sprint_distance, acd_load')
      .gte('training_date', toLocalDateStr(cStart))
      .lte('training_date', toLocalDateStr(cEnd))
      .order('training_date', { ascending: true });
    if (chunk) dailyData.push(...chunk);
  }

  // 경기일 부하(match_data)도 함께 가져온다 — 경기 GPS 기록은 training_daily에 없어
  // 경기 다음날 ACWR 계산에서 통째로 누락되고 있었음(경기일이 훈련 부하가 가장 큰 날인 경우가 많음).
  const { data: matchRows } = await supabase
    .from('match_data')
    .select('player_id, match_date, play_time_min, rpe, total_distance, hsr_distance, sprint_distance, acd_load')
    .eq('player_group', 'U15')
    .gte('match_date', toLocalDateStr(startDate))
    .lte('match_date', toLocalDateStr(today));

  if (dailyData.length === 0 && (!matchRows || matchRows.length === 0)) {
    return { tl: [], td: [], hsr: [], sprint: [], acd: [] };
  }

  const byDate = new Map<string, any[]>();
  for (const row of dailyData as any[]) {
    const d = row.training_date as string;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(row);
  }

  const allDates: string[] = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    allDates.push(toLocalDateStr(d));
  }

  // 선수 단위로 훈련(training_daily) + 경기(match_data) 부하를 합산한다.
  // 같은 날 훈련과 경기가 모두 있는 선수는 두 부하를 더한다.
  type PlayerDay = { tl: number | null; td: number; hsr: number; sprint: number; acd: number };
  const perPlayerDay = new Map<string, Map<string, PlayerDay>>();
  const ensure = (date: string, playerId: string) => {
    if (!perPlayerDay.has(date)) perPlayerDay.set(date, new Map());
    const m = perPlayerDay.get(date)!;
    if (!m.has(playerId)) m.set(playerId, { tl: null, td: 0, hsr: 0, sprint: 0, acd: 0 });
    return m.get(playerId)!;
  };

  for (const date of allDates) {
    const rows = (byDate.get(date) ?? []).filter((r: any) => r.group_type === 'U15');
    for (const r of rows) {
      const e = ensure(date, r.player_id);
      const dtl = Number(r.daily_training_load) || 0;
      let tl: number | null = null;
      if (dtl > 0) tl = dtl;
      else {
        const dur = Number(r.duration_min) || 0;
        const rpe = Number(r.rpe) || 0;
        if (dur > 0 && rpe > 0) tl = dur * rpe;
      }
      if (tl !== null) e.tl = (e.tl ?? 0) + tl;
      e.td += Number(r.total_distance) || 0;
      e.hsr += Number(r.hsr_distance) || 0;
      e.sprint += Number(r.sprint_distance) || 0;
      e.acd += Number(r.acd_load) || 0;
    }
  }
  for (const r of (matchRows ?? []) as any[]) {
    const date = r.match_date as string;
    const e = ensure(date, r.player_id);
    const dur = Number(r.play_time_min) || 0;
    const rpe = Number(r.rpe) || 0;
    const tl = (dur > 0 && rpe > 0) ? dur * rpe : null;
    if (tl !== null) e.tl = (e.tl ?? 0) + tl;
    e.td += Number(r.total_distance) || 0;
    e.hsr += Number(r.hsr_distance) || 0;
    e.sprint += Number(r.sprint_distance) || 0;
    e.acd += Number(r.acd_load) || 0;
  }

  const dateMap = new Map<string, TeamAcwrDayData & { n: number; tlMissing: boolean; hasSession: boolean }>();
  for (const date of allDates) {
    const rows = byDate.get(date) ?? [];
    const players = [...(perPlayerDay.get(date)?.values() ?? [])];
    const n = players.length;

    // RPE 미입력 등으로 TL을 산출할 수 없는 선수는 0이 아니라 집계에서 제외한다.
    // (일부 선수만 RPE 미입력인 날 전체를 0으로 채우면 팀 평균이 부당하게 희석됨)
    const tlValid = players.map(p => p.tl).filter((v): v is number => v !== null);
    const tlVal = tlValid.length > 0 ? tlValid.reduce((a, b) => a + b, 0) / tlValid.length : 0;
    // 유효 데이터가 있는 선수가 한 명도 없는 날 — "실제 저부하"가 아니라 "데이터 없음"으로 구분
    const tlMissing = n > 0 && tlValid.length === 0;
    const avgOf = (fn: (p: PlayerDay) => number) => n === 0 ? 0 : players.reduce((s, p) => s + fn(p), 0) / n;

    dateMap.set(date, {
      date,
      n,
      hasSession: rows.length > 0 || n > 0,
      tlMissing,
      tl: tlVal,
      td: avgOf(p => p.td),
      hsr: avgOf(p => p.hsr),
      sprint: avgOf(p => p.sprint),
      acd: avgOf(p => p.acd),
    });
  }

  // 장기 공백(연속 10일 이상 세션 기록 없음 — 방학 등) 이후 웜업 구간(7일) 판정.
  // 매주 1회 정도의 짧은 휴식(예: 일요일)은 정상 스케줄이므로 리셋 대상에서 제외한다.
  const GAP_THRESHOLD = 10;
  const WARMUP_DAYS = 7;
  const resetDates = new Set<string>();
  const warmupDates = new Set<string>();
  {
    let gapRun = 0;
    for (let i = 0; i < allDates.length; i++) {
      const has = dateMap.get(allDates[i])!.hasSession;
      if (!has) {
        gapRun++;
      } else {
        if (gapRun >= GAP_THRESHOLD) {
          resetDates.add(allDates[i]);
          for (let k = 0; k < WARMUP_DAYS && i + k < allDates.length; k++) warmupDates.add(allDates[i + k]);
        }
        gapRun = 0;
      }
    }
  }

  // Compute EWMA for each metric
  // Acute λ=0.25 (Williams et al. 2016 표준: EWMA_today = value*λ + EWMA_yesterday*(1-λ), λacute=2/(7+1))
  function computeEwma(dailyValues: { date: string; value: number; n: number; missing: boolean }[]): TeamAcwrSeries[] {
    let acute: number | null = null;
    let chronic: number | null = null;
    let lastRawValue = 0;
    return dailyValues.map(({ date, value, n, missing }, i) => {
      // 데이터 미입력일은 0으로 취급하지 않고 직전 값으로 대체해 EWMA 왜곡을 막는다.
      const effectiveValue = missing ? lastRawValue : value;
      if (!missing) lastRawValue = value;

      if (acute === null || resetDates.has(date)) {
        acute = effectiveValue;
        chronic = effectiveValue;
      } else {
        acute = acute * 0.75 + effectiveValue * 0.25;
        chronic = effectiveValue * 0.069 + chronic! * 0.931;
      }
      const acwr = (acute > 0 && chronic! > 0) ? acute / chronic! : 0;
      const prev = i > 0 ? dailyValues[i - 1] : null;
      const postRest = !!prev && prev.value === 0 && !prev.missing && !missing;
      return {
        // daily도 결측일엔 effectiveValue(전날 값 대체)를 써야 Monotony 주간 SD·Strain 주간 합산에 0이 섞여 들어가지 않는다.
        date, daily: effectiveValue, acute, chronic: chronic!, acwr,
        n, missing, warmup: warmupDates.has(date), postRest,
      };
    });
  }

  const metrics: (keyof TeamAcwrDayData)[] = ['tl', 'td', 'hsr', 'sprint', 'acd'];
  const result: Record<string, TeamAcwrSeries[]> = {};

  for (const metric of metrics) {
    const dailyValues = allDates.map(d => {
      const rec = dateMap.get(d)!;
      return { date: d, value: rec[metric] as number, n: rec.n, missing: metric === 'tl' ? rec.tlMissing : false };
    });
    result[metric] = computeEwma(dailyValues);
  }

  return result as any;
}

// 선수 개인 ACWR/Monotony (TL/TD/HSR/Sprint/ACD Load 5개 항목, 팀 대시보드와 동일한 EWMA 프로세스)
export async function fetchPlayerAcwrMultiMetric(playerId: string, days: number = 90): Promise<{
  tl: TeamAcwrSeries[];
  td: TeamAcwrSeries[];
  hsr: TeamAcwrSeries[];
  sprint: TeamAcwrSeries[];
  acd: TeamAcwrSeries[];
}> {
  if (!supabase) return { tl: [], td: [], hsr: [], sprint: [], acd: [] };

  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);

  const { data: dailyData } = await supabase
    .from('training_daily')
    .select('training_date, daily_training_load, duration_min, rpe, total_distance, hsr_distance, sprint_distance, acd_load')
    .eq('player_id', playerId)
    .gte('training_date', toLocalDateStr(startDate))
    .lte('training_date', toLocalDateStr(today))
    .order('training_date', { ascending: true });

  // 경기 부하(match_data)도 함께 가져와 같은 날짜의 훈련 부하에 합산한다.
  const { data: matchData } = await supabase
    .from('match_data')
    .select('match_date, play_time_min, rpe, total_distance, hsr_distance, sprint_distance, acd_load')
    .eq('player_id', playerId)
    .gte('match_date', toLocalDateStr(startDate))
    .lte('match_date', toLocalDateStr(today));

  if ((!dailyData || dailyData.length === 0) && (!matchData || matchData.length === 0)) {
    return { tl: [], td: [], hsr: [], sprint: [], acd: [] };
  }

  const byDate = new Map((dailyData as R[] ?? []).map(r => [r.training_date as string, r]));
  const matchByDate = new Map((matchData as R[] ?? []).map(r => [r.match_date as string, r]));

  const allDates: string[] = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    allDates.push(toLocalDateStr(d));
  }

  const dateMap = new Map<string, TeamAcwrDayData>();
  for (const date of allDates) {
    const r = byDate.get(date);
    const m = matchByDate.get(date);
    const trainingTl = r ? (Number(r.daily_training_load) || (Number(r.duration_min) || 0) * (Number(r.rpe) || 0)) : 0;
    const matchTl = m && Number(m.play_time_min) > 0 && Number(m.rpe) > 0 ? Number(m.play_time_min) * Number(m.rpe) : 0;
    dateMap.set(date, {
      date,
      tl: trainingTl + matchTl,
      td: (r ? Number(r.total_distance) || 0 : 0) + (m ? Number(m.total_distance) || 0 : 0),
      hsr: (r ? Number(r.hsr_distance) || 0 : 0) + (m ? Number(m.hsr_distance) || 0 : 0),
      sprint: (r ? Number(r.sprint_distance) || 0 : 0) + (m ? Number(m.sprint_distance) || 0 : 0),
      acd: (r ? Number(r.acd_load) || 0 : 0) + (m ? Number(m.acd_load) || 0 : 0),
    });
  }

  function computeEwma(dailyValues: { date: string; value: number }[]): TeamAcwrSeries[] {
    let acute: number | null = null;
    let chronic: number | null = null;
    return dailyValues.map(({ date, value }) => {
      if (acute === null) {
        acute = value;
        chronic = value;
      } else {
        acute = acute * 0.75 + value * 0.25;
        chronic = value * 0.069 + chronic! * 0.931;
      }
      const acwr = (acute > 0 && chronic! > 0) ? acute / chronic! : 0;
      return { date, daily: value, acute, chronic: chronic!, acwr };
    });
  }

  const metrics: (keyof TeamAcwrDayData)[] = ['tl', 'td', 'hsr', 'sprint', 'acd'];
  const result: Record<string, TeamAcwrSeries[]> = {};

  for (const metric of metrics) {
    const dailyValues = allDates.map(d => ({
      date: d,
      value: dateMap.get(d)?.[metric] as number ?? 0,
    }));
    result[metric] = computeEwma(dailyValues);
  }

  return result as any;
}

// 전체 선수의 개인 ACWR(TL/TD/HSR/Sprint/ACD Load)을 한 번에 계산 (홈 화면 선수 현황 바용).
// fetchPlayerAcwrMultiMetric과 동일한 EWMA 로직을 선수별로 반복한다.
export async function fetchAllPlayersAcwrMultiMetric(days: number = 90): Promise<Map<string, {
  tl: TeamAcwrSeries[]; td: TeamAcwrSeries[]; hsr: TeamAcwrSeries[]; sprint: TeamAcwrSeries[]; acd: TeamAcwrSeries[];
}>> {
  const result = new Map<string, { tl: TeamAcwrSeries[]; td: TeamAcwrSeries[]; hsr: TeamAcwrSeries[]; sprint: TeamAcwrSeries[]; acd: TeamAcwrSeries[] }>();
  if (!supabase) return result;

  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  const startStr = toLocalDateStr(startDate);
  const todayStr = toLocalDateStr(today);

  const { data: dailyData } = await supabase
    .from('training_daily')
    .select('player_id, training_date, daily_training_load, duration_min, rpe, total_distance, hsr_distance, sprint_distance, acd_load')
    .gte('training_date', startStr)
    .lte('training_date', todayStr);

  const { data: matchData } = await supabase
    .from('match_data')
    .select('player_id, match_date, play_time_min, rpe, total_distance, hsr_distance, sprint_distance, acd_load')
    .gte('match_date', startStr)
    .lte('match_date', todayStr);

  const playerIds = new Set<string>([
    ...((dailyData as R[] ?? []).map(r => r.player_id as string)),
    ...((matchData as R[] ?? []).map(r => r.player_id as string)),
  ]);
  if (playerIds.size === 0) return result;

  const allDates: string[] = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    allDates.push(toLocalDateStr(d));
  }

  const dailyByPlayer = new Map<string, Map<string, R>>();
  for (const r of (dailyData as R[] ?? [])) {
    const pid = r.player_id as string;
    if (!dailyByPlayer.has(pid)) dailyByPlayer.set(pid, new Map());
    dailyByPlayer.get(pid)!.set(r.training_date as string, r);
  }
  const matchByPlayer = new Map<string, Map<string, R>>();
  for (const r of (matchData as R[] ?? [])) {
    const pid = r.player_id as string;
    if (!matchByPlayer.has(pid)) matchByPlayer.set(pid, new Map());
    matchByPlayer.get(pid)!.set(r.match_date as string, r);
  }

  function computeEwma(dailyValues: { date: string; value: number }[]): TeamAcwrSeries[] {
    let acute: number | null = null;
    let chronic: number | null = null;
    return dailyValues.map(({ date, value }) => {
      if (acute === null) {
        acute = value;
        chronic = value;
      } else {
        acute = acute * 0.75 + value * 0.25;
        chronic = value * 0.069 + chronic! * 0.931;
      }
      const acwr = (acute > 0 && chronic! > 0) ? acute / chronic! : 0;
      return { date, daily: value, acute, chronic: chronic!, acwr };
    });
  }

  const metrics: (keyof TeamAcwrDayData)[] = ['tl', 'td', 'hsr', 'sprint', 'acd'];

  for (const playerId of playerIds) {
    const byDate = dailyByPlayer.get(playerId) ?? new Map();
    const matchDates = matchByPlayer.get(playerId) ?? new Map();
    const dateMap = new Map<string, TeamAcwrDayData>();
    for (const date of allDates) {
      const r = byDate.get(date);
      const m = matchDates.get(date);
      const trainingTl = r ? (Number(r.daily_training_load) || (Number(r.duration_min) || 0) * (Number(r.rpe) || 0)) : 0;
      const matchTl = m && Number(m.play_time_min) > 0 && Number(m.rpe) > 0 ? Number(m.play_time_min) * Number(m.rpe) : 0;
      dateMap.set(date, {
        date,
        tl: trainingTl + matchTl,
        td: (r ? Number(r.total_distance) || 0 : 0) + (m ? Number(m.total_distance) || 0 : 0),
        hsr: (r ? Number(r.hsr_distance) || 0 : 0) + (m ? Number(m.hsr_distance) || 0 : 0),
        sprint: (r ? Number(r.sprint_distance) || 0 : 0) + (m ? Number(m.sprint_distance) || 0 : 0),
        acd: (r ? Number(r.acd_load) || 0 : 0) + (m ? Number(m.acd_load) || 0 : 0),
      });
    }

    const playerResult: Record<string, TeamAcwrSeries[]> = {};
    for (const metric of metrics) {
      const dailyValues = allDates.map(d => ({ date: d, value: dateMap.get(d)?.[metric] as number ?? 0 }));
      playerResult[metric] = computeEwma(dailyValues);
    }
    result.set(playerId, playerResult as any);
  }

  return result;
}

// ── 신체 성숙도 (Maturity) — 선수당 1회 고정값 (players 테이블) ──────────
export interface MaturityRow {
  player_id: string;
  player_name: string;
  jersey_number: number | null;
  position: string | null;
  birth_date: string | null;
  baseline_height_cm: number | null;
  baseline_weight_kg: number | null;
  chair_height_cm: number | null;
  baseline_sitting_height_cm: number | null;
  baseline_measured_at: string | null;
  mother_height_cm: number | null;
  father_height_cm: number | null;
  age_decimal: number | null;
  mirwald_maturity_offset: number | null;
  mirwald_aphv_age: number | null;
  maturity_stage: string | null;
  predicted_adult_height_cm: number | null;
  pah_percent: number | null;
  maturity_zscore: number | null;
}

export async function fetchMaturityRecords(): Promise<MaturityRow[]> {
  const client = requireSupabase();

  const { data: players, error } = await client
    .from('players')
    .select('id, name, jersey_number, position, birth_date, baseline_height_cm, baseline_weight_kg, chair_height_cm, baseline_sitting_height_cm, baseline_measured_at, mother_height_cm, father_height_cm')
    .order('jersey_number', { ascending: true });
  if (error) throw error;

  const { data: calc } = await client
    .from('player_phv_khamis_roche')
    .select('player_id, age_decimal, mirwald_maturity_offset, mirwald_aphv_age, maturity_stage, predicted_adult_height_cm, pah_percent, maturity_zscore');
  const calcMap = new Map(((calc as R[]) ?? []).map(c => [c.player_id as string, c]));

  return ((players as R[]) ?? []).map(p => {
    const c = calcMap.get(p.id as string);
    return {
      player_id: p.id as string,
      player_name: p.name as string,
      jersey_number: p.jersey_number as number ?? null,
      position: p.position as string ?? null,
      birth_date: p.birth_date as string ?? null,
      baseline_height_cm: p.baseline_height_cm != null ? Number(p.baseline_height_cm) : null,
      baseline_weight_kg: p.baseline_weight_kg != null ? Number(p.baseline_weight_kg) : null,
      chair_height_cm: p.chair_height_cm != null ? Number(p.chair_height_cm) : null,
      baseline_sitting_height_cm: p.baseline_sitting_height_cm != null ? Number(p.baseline_sitting_height_cm) : null,
      baseline_measured_at: p.baseline_measured_at as string ?? null,
      mother_height_cm: p.mother_height_cm != null ? Number(p.mother_height_cm) : null,
      father_height_cm: p.father_height_cm != null ? Number(p.father_height_cm) : null,
      age_decimal: c?.age_decimal != null ? Number(c.age_decimal) : null,
      mirwald_maturity_offset: c?.mirwald_maturity_offset != null ? Number(c.mirwald_maturity_offset) : null,
      mirwald_aphv_age: c?.mirwald_aphv_age != null ? Number(c.mirwald_aphv_age) : null,
      maturity_stage: c?.maturity_stage as string ?? null,
      predicted_adult_height_cm: c?.predicted_adult_height_cm != null ? Number(c.predicted_adult_height_cm) : null,
      pah_percent: c?.pah_percent != null ? Number(c.pah_percent) : null,
      maturity_zscore: c?.maturity_zscore != null ? Number(c.maturity_zscore) : null,
    };
  });
}

// 구글 시트(폼 응답)에서 신체 성숙도 원본값을 동기화한다.
// 값은 화면에서 수동으로 수정할 수 없는 고정값이지만, 시트에 새 응답이 올라오면 자동으로 덮어써서 반영한다.
export interface MaturitySyncResult {
  updatedCount: number;
  unmatchedNames: string[];
}

export async function syncMaturityFromGoogleSheet(): Promise<MaturitySyncResult> {
  const res = await fetch(GOOGLE_SHEET_MATURITY_URL);
  if (!res.ok) throw new Error('구글 시트를 불러올 수 없습니다.');
  const text = await res.text();
  const rows = parseMaturitySheetCsv(text);
  if (rows.length === 0) return { updatedCount: 0, unmatchedNames: [] };

  // 같은 선수가 여러 번 응답했다면 최신 타임스탬프만 사용
  const latestByName = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const name = normalizeName(row.player_name);
    const prev = latestByName.get(name);
    if (!prev || row.timestamp > prev.timestamp) latestByName.set(name, row);
  }

  const client = requireSupabase();
  const { data: players, error } = await client
    .from('players')
    .select('id, name, baseline_height_cm, baseline_weight_kg, chair_height_cm, baseline_sitting_height_cm, baseline_measured_at, mother_height_cm, father_height_cm');
  if (error) throw error;

  const playerMap = new Map(((players as R[]) ?? []).map(p => [normalizeName(p.name as string), p]));

  let updatedCount = 0;
  const unmatchedNames: string[] = [];

  for (const [name, row] of latestByName) {
    const player = playerMap.get(name);
    if (!player) {
      unmatchedNames.push(row.player_name);
      continue;
    }

    const fields: Record<string, number | string> = {};
    if (row.height != null) fields.baseline_height_cm = row.height;
    if (row.weight != null) fields.baseline_weight_kg = row.weight;
    if (row.chair_height != null) fields.chair_height_cm = row.chair_height;
    if (row.sitting_height != null) fields.baseline_sitting_height_cm = row.sitting_height;
    if (row.mother_height != null) fields.mother_height_cm = row.mother_height;
    if (row.father_height != null) fields.father_height_cm = row.father_height;
    const measuredAt = parseSheetTimestampToDate(row.timestamp);
    if (measuredAt) fields.baseline_measured_at = measuredAt;

    if (Object.keys(fields).length === 0) continue;

    const { error: updateError } = await client
      .from('players')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', player.id as string);
    if (updateError) throw updateError;
    updatedCount++;
  }

  return { updatedCount, unmatchedNames };
}

// 구글 시트(월별 신장·체중 자동 기록)에서 growth_tracking으로 동기화한다.
// 시트 헤더의 "N월" 열은 올해(진행 연도) 기록으로 간주한다.
export interface BodySyncResult {
  updatedCount: number;
  unmatchedNames: string[];
}

export async function syncBodyCompositionFromGoogleSheet(): Promise<BodySyncResult> {
  const res = await fetch(GOOGLE_SHEET_BODY_URL);
  if (!res.ok) throw new Error('구글 시트를 불러올 수 없습니다.');
  const text = await res.text();
  const rows = parseBodySheetCsv(text);
  if (rows.length === 0) return { updatedCount: 0, unmatchedNames: [] };

  const client = requireSupabase();
  const { data: players, error } = await client.from('players').select('id, name');
  if (error) throw error;
  const playerMap = new Map(((players as R[]) ?? []).map(p => [normalizeName(p.name as string), p.id as string]));

  const year = new Date().getFullYear();
  const growthRows: { player_id: string; year: number; month: number; height: number | null; weight: number | null }[] = [];
  const unmatchedNames: string[] = [];

  for (const row of rows) {
    const playerId = playerMap.get(normalizeName(row.player_name));
    if (!playerId) {
      unmatchedNames.push(row.player_name);
      continue;
    }
    for (const entry of row.entries) {
      if (entry.height == null && entry.weight == null) continue;
      growthRows.push({ player_id: playerId, year, month: entry.month, height: entry.height, weight: entry.weight });
    }
  }

  if (growthRows.length === 0) return { updatedCount: 0, unmatchedNames };

  const { error: upsertError } = await client
    .from('growth_tracking')
    .upsert(growthRows, { onConflict: 'player_id,year,month' });
  if (upsertError) throw upsertError;

  return { updatedCount: growthRows.length, unmatchedNames };
}

// 선택한 선수들의 신체 성숙도 입력값을 초기화(명단에서 제외 효과)
export async function clearMaturityData(playerIds: string[]): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('players')
    .update({
      baseline_height_cm: null,
      baseline_weight_kg: null,
      chair_height_cm: null,
      baseline_sitting_height_cm: null,
      baseline_measured_at: null,
      mother_height_cm: null,
      father_height_cm: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', playerIds);
  if (error) throw error;
}

// 임시 계산기(선수 명단 외 인원)용 Khamis-Roche 계수 테이블 전체 조회
export interface KhamisRocheCoefficient {
  age_decimal: number;
  bo: number;
  coef_stature: number;
  coef_weight: number;
  coef_midparent_stature: number;
}

export async function fetchKhamisRocheCoefficients(): Promise<KhamisRocheCoefficient[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('khamis_roche_coefficients')
    .select('age_decimal, bo, coef_stature, coef_weight, coef_midparent_stature')
    .order('age_decimal', { ascending: true });
  if (error) throw error;
  return ((data as R[]) ?? []).map(r => ({
    age_decimal: Number(r.age_decimal),
    bo: Number(r.bo),
    coef_stature: Number(r.coef_stature),
    coef_weight: Number(r.coef_weight),
    coef_midparent_stature: Number(r.coef_midparent_stature),
  }));
}

// ── 피지컬 데이터 (VALD 체력 테스트) — 측정일마다 누적 저장 ───────────────
export interface PhysicalTestRow {
  id: string;
  player_id: string;
  player_name: string;
  jersey_number: number | null;
  position: string | null;
  test_date: string;
  test_round: string | null;
  height: number | null;
  weight: number | null;
  cmj_height: number | null;
  squat_jump_height: number | null;
  cmj_peak_force: number | null;
  squat_jump_peak_force: number | null;
  nordic_curl_left: number | null;
  nordic_curl_right: number | null;
  ham_iso_left: number | null;
  ham_iso_right: number | null;
  hip_ad_left: number | null;
  hip_ad_right: number | null;
  hip_ab_left: number | null;
  hip_ab_right: number | null;
  sprint_5m_time: number | null;
  sprint_10m_time: number | null;
  sprint_30m_time: number | null;
  cod_run: number | null;
  cod_ball: number | null;
}

export async function fetchPhysicalTestRecords(): Promise<PhysicalTestRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('physical_report')
    .select('id, player_id, test_date, test_round, height, weight, cmj_height, squat_jump_height, cmj_peak_force, squat_jump_peak_force, nordic_curl_left, nordic_curl_right, ham_iso_left, ham_iso_right, hip_ad_left, hip_ad_right, hip_ab_left, hip_ab_right, sprint_5m_time, sprint_10m_time, sprint_30m_time, cod_run, cod_ball, players(name, jersey_number, position)')
    .order('test_date', { ascending: false });
  if (error) throw error;

  return ((data as R[]) ?? []).map(r => {
    const player = r.players as R;
    return {
      id: r.id as string,
      player_id: r.player_id as string,
      player_name: (player?.name as string) ?? '',
      jersey_number: player?.jersey_number as number ?? null,
      position: player?.position as string ?? null,
      test_date: r.test_date as string,
      test_round: r.test_round as string ?? null,
      height: r.height != null ? Number(r.height) : null,
      weight: r.weight != null ? Number(r.weight) : null,
      cmj_height: r.cmj_height != null ? Number(r.cmj_height) : null,
      squat_jump_height: r.squat_jump_height != null ? Number(r.squat_jump_height) : null,
      cmj_peak_force: r.cmj_peak_force != null ? Number(r.cmj_peak_force) : null,
      squat_jump_peak_force: r.squat_jump_peak_force != null ? Number(r.squat_jump_peak_force) : null,
      nordic_curl_left: r.nordic_curl_left != null ? Number(r.nordic_curl_left) : null,
      nordic_curl_right: r.nordic_curl_right != null ? Number(r.nordic_curl_right) : null,
      ham_iso_left: r.ham_iso_left != null ? Number(r.ham_iso_left) : null,
      ham_iso_right: r.ham_iso_right != null ? Number(r.ham_iso_right) : null,
      hip_ad_left: r.hip_ad_left != null ? Number(r.hip_ad_left) : null,
      hip_ad_right: r.hip_ad_right != null ? Number(r.hip_ad_right) : null,
      hip_ab_left: r.hip_ab_left != null ? Number(r.hip_ab_left) : null,
      hip_ab_right: r.hip_ab_right != null ? Number(r.hip_ab_right) : null,
      sprint_5m_time: r.sprint_5m_time != null ? Number(r.sprint_5m_time) : null,
      sprint_10m_time: r.sprint_10m_time != null ? Number(r.sprint_10m_time) : null,
      sprint_30m_time: r.sprint_30m_time != null ? Number(r.sprint_30m_time) : null,
      cod_run: r.cod_run != null ? Number(r.cod_run) : null,
      cod_ball: r.cod_ball != null ? Number(r.cod_ball) : null,
    };
  });
}

export async function upsertPhysicalTestRecord(input: {
  player_id: string;
  test_date: string;
  height: number | null;
  weight: number | null;
  cmj_height: number | null;
  squat_jump_height: number | null;
  cmj_peak_force: number | null;
  squat_jump_peak_force: number | null;
  nordic_curl_left: number | null;
  nordic_curl_right: number | null;
  ham_iso_left: number | null;
  ham_iso_right: number | null;
  hip_ad_left: number | null;
  hip_ad_right: number | null;
  hip_ab_left: number | null;
  hip_ab_right: number | null;
  sprint_5m_time: number | null;
  sprint_10m_time: number | null;
  sprint_30m_time: number | null;
  cod_run: number | null;
  cod_ball: number | null;
}) {
  const client = requireSupabase();
  const { error } = await client
    .from('physical_report')
    .upsert(input, { onConflict: 'player_id,test_date' });
  if (error) throw error;
}

// ── VALD 항목 목록 (임계값 입력 화면·팀 비교 차트 공용) ───────────────────
export const VALD_METRIC_DEFS: {
  key: string; label: string; unit: string; invert?: boolean; hasLR?: boolean; note?: string;
  tiers?: { max: number; label: string }[]; dotPlot?: boolean;
}[] = [
  { key: 'nordic_curl', label: 'Nordic Curl (햄스트링 근력)', unit: 'N', hasLR: true },
  { key: 'hip_abduction', label: 'Hip Abduction (고관절 벌림)', unit: 'N', hasLR: true },
  { key: 'hip_adduction', label: 'Hip Adduction (고관절 모음)', unit: 'N', hasLR: true },
  { key: 'ham_iso', label: 'Hamstring Iso Prone (등척성 버티기)', unit: 'N', hasLR: true },
  { key: 'cmj_height', label: 'CMJ (반동 점프 높이)', unit: 'cm' },
  { key: 'cmj_peak_force', label: 'CMJ Peak Force (반동 점프 파워)', unit: 'N' },
  { key: 'squat_jump_height', label: 'Squat Jump (스쿼트 점프 높이)', unit: 'cm' },
  { key: 'squat_jump_peak_force', label: 'Squat Jump Peak Force (스쿼트 점프 파워)', unit: 'N' },
  {
    key: 'eur', label: 'EUR (Eccentric Utilization Ratio)', unit: '',
    note: 'EUR = CMJ 높이 ÷ Squat Jump 높이. 1.1 이하 = 폭발적인 힘을 위한 훈련 필요 / 1.1~1.15 = 현재 훈련 비율 유지 / 1.15 이상 = 최대근력 훈련 필요',
    tiers: [
      { max: 1.1, label: '1.1 이하 · 폭발적인 힘 훈련 필요' },
      { max: 1.15, label: '1.1~1.15 · 현재 훈련 비율 유지' },
      { max: Infinity, label: '1.15 이상 · 최대근력 훈련 필요' },
    ],
  },
  { key: 'sprint_5m', label: '5m 스프린트', unit: 'sec', invert: true, dotPlot: true },
  { key: 'sprint_10m', label: '10m 스프린트', unit: 'sec', invert: true, dotPlot: true },
  { key: 'sprint_30m', label: '30m 스프린트', unit: 'sec', invert: true, dotPlot: true },
  { key: 'cod_run', label: '방향전환(볼 무)', unit: 'sec', invert: true, dotPlot: true },
  { key: 'cod_ball', label: '방향전환(볼 유)', unit: 'sec', invert: true, dotPlot: true },
];
export const VALD_GRADES = ['전체', '1학년', '2학년', '3학년'] as const;

// VALD 항목별 좌/우/단일값 접근자 (PhysicalTestRow → 항목 값). 팀 비교 차트와
// 임계값 자동 채우기(데이터 관리 페이지)가 동일한 정의를 공유한다.
export const VALD_ACCESSORS: Record<string, { left?: (r: PhysicalTestRow) => number | null; right?: (r: PhysicalTestRow) => number | null; value?: (r: PhysicalTestRow) => number | null }> = {
  nordic_curl: { left: r => r.nordic_curl_left, right: r => r.nordic_curl_right },
  hip_abduction: { left: r => r.hip_ab_left, right: r => r.hip_ab_right },
  hip_adduction: { left: r => r.hip_ad_left, right: r => r.hip_ad_right },
  ham_iso: { left: r => r.ham_iso_left, right: r => r.ham_iso_right },
  cmj_height: { value: r => r.cmj_height },
  cmj_peak_force: { value: r => r.cmj_peak_force },
  squat_jump_height: { value: r => r.squat_jump_height },
  squat_jump_peak_force: { value: r => r.squat_jump_peak_force },
  eur: { value: r => (r.cmj_height != null && r.squat_jump_height != null && r.squat_jump_height > 0) ? r.cmj_height / r.squat_jump_height : null },
  sprint_5m: { value: r => r.sprint_5m_time },
  sprint_10m: { value: r => r.sprint_10m_time },
  sprint_30m: { value: r => r.sprint_30m_time },
  cod_run: { value: r => r.cod_run },
  cod_ball: { value: r => r.cod_ball },
};

// 좌/우 평균 혹은 단일값으로 항목의 대표값 하나를 계산 (임계값 자동 채우기용)
export function computeValdValue(metricKey: string, record: PhysicalTestRow): number | null {
  const acc = VALD_ACCESSORS[metricKey];
  if (!acc) return null;
  if (acc.value) return acc.value(record);
  if (acc.left && acc.right) {
    const l = acc.left(record);
    const r = acc.right(record);
    if (l != null && r != null) return (l + r) / 2;
    return l ?? r ?? null;
  }
  return null;
}

// ── VALD 항목별 학년 임계값(최대/평균/최저) — 수동 입력 ──────────────────
export interface ValdThreshold {
  metric_key: string;
  grade: string; // '전체' | '1학년' | '2학년' | '3학년'
  max_value: number | null;
  avg_value: number | null;
  min_value: number | null;
}

export async function fetchValdThresholds(): Promise<ValdThreshold[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('vald_thresholds').select('metric_key, grade, max_value, avg_value, min_value');
  if (error) throw error;
  return ((data as R[]) ?? []).map(r => ({
    metric_key: r.metric_key as string,
    grade: r.grade as string,
    max_value: r.max_value != null ? Number(r.max_value) : null,
    avg_value: r.avg_value != null ? Number(r.avg_value) : null,
    min_value: r.min_value != null ? Number(r.min_value) : null,
  }));
}

export async function upsertValdThresholds(rows: ValdThreshold[]): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('vald_thresholds').upsert(rows, { onConflict: 'metric_key,grade' });
  if (error) throw error;
}

export async function importPhysicalCsvRows(rows: ParsedPhysicalRow[], date: string, seasonYear: number, overrides?: Map<string, string>) {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows.map(r => ({ player_name: r.player_name, jersey_number: 0 })), seasonYear, overrides);

  const physicalRows = validRows.map(row => ({
    player_id: playerMap.get(normalizeName(row.player_name)),
    test_date: date,
    nordic_curl_left: row.nordic_curl_left,
    nordic_curl_right: row.nordic_curl_right,
    hip_ab_left: row.hip_ab_left,
    hip_ab_right: row.hip_ab_right,
    hip_ad_left: row.hip_ad_left,
    hip_ad_right: row.hip_ad_right,
    sprint_5m_time: row.sprint_5m_time,
    sprint_10m_time: row.sprint_10m_time,
    sprint_30m_time: row.sprint_30m_time,
    cmj_height: row.cmj_height,
    rebound_jump_height: row.rebound_jump_height,
    squat_jump_height: row.squat_jump_height,
    cmj_peak_force: row.cmj_peak_force,
    squat_jump_peak_force: row.squat_jump_peak_force,
    cod_run: row.cod_run,
    cod_ball: row.cod_ball,
    mas_value: row.mas_value,
    mss_value: row.mss_value,
  })).filter(row => row.player_id);

  if (physicalRows.length === 0) return physicalRows.length;

  const { error } = await client
    .from('physical_report')
    .upsert(physicalRows, { onConflict: 'player_id,test_date' });
  if (error) throw error;

  return physicalRows.length;
}

// ── 피지컬 데이터 / Body composition (월별 신장·체중 축적) ────────────────
export interface BodyCompositionRow {
  id: string;
  player_id: string;
  player_name: string;
  jersey_number: number | null;
  position: string | null;
  year: number;
  month: number;
  height: number | null;
  weight: number | null;
}

export async function fetchBodyCompositionRecords(): Promise<BodyCompositionRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('growth_tracking')
    .select('id, player_id, year, month, height, weight, players(name, jersey_number, position)')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;

  return ((data as R[]) ?? []).map(r => {
    const player = r.players as R;
    return {
      id: r.id as string,
      player_id: r.player_id as string,
      player_name: (player?.name as string) ?? '',
      jersey_number: player?.jersey_number as number ?? null,
      position: player?.position as string ?? null,
      year: r.year as number,
      month: r.month as number,
      height: r.height != null ? Number(r.height) : null,
      weight: r.weight != null ? Number(r.weight) : null,
    };
  });
}

export async function importBodyCompositionCsvRows(rows: ParsedBodyCompositionRow[], date: string, seasonYear: number, overrides?: Map<string, string>) {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows.map(r => ({ player_name: r.player_name, jersey_number: 0 })), seasonYear, overrides);

  const [year, month] = date.split('-').map(Number);

  const growthRows = validRows.map(row => ({
    player_id: playerMap.get(normalizeName(row.player_name)),
    year,
    month,
    height: row.height,
    weight: row.weight,
  })).filter(row => row.player_id);

  if (growthRows.length === 0) return growthRows.length;

  const { error } = await client
    .from('growth_tracking')
    .upsert(growthRows, { onConflict: 'player_id,year,month' });
  if (error) throw error;

  return growthRows.length;
}

// ── 피지컬 데이터 / Speed custom (골격 구조, 컬럼은 CSV 형식 확정 후 추가 예정) ──
// 선수별 역대 최고 MAS/MSS 기준 커스텀 속도 Zone (VAMEVAL MAS 60/80/100%, ASR 20%, MSS 80%)
export interface SpeedCustomRow {
  player_id: string;
  player_name: string;
  jersey_number: number | null;
  position: string | null;
  mss: number;
  mas: number;
  zone1_mas60: number;
  zone2_mas80: number;
  zone3_mas100: number;
  zone4_asr20: number;
  zone5_mss80: number;
}

export async function fetchSpeedCustomRecords(): Promise<SpeedCustomRow[]> {
  const client = requireSupabase();
  const { data: players } = await client.from('players').select('id, name, jersey_number, position');
  const playerMap = new Map(((players as R[]) ?? []).map(p => [p.id as string, p]));

  const { data, error } = await client
    .from('player_speed_zones')
    .select('player_id, mss, mas, zone1_mas60, zone2_mas80, zone3_mas100, zone4_asr20, zone5_mss80');
  if (error) throw error;

  return ((data as R[]) ?? []).map(r => {
    const player = playerMap.get(r.player_id as string);
    return {
      player_id: r.player_id as string,
      player_name: (player?.name as string) ?? '',
      jersey_number: player?.jersey_number as number ?? null,
      position: player?.position as string ?? null,
      mss: Number(r.mss),
      mas: Number(r.mas),
      zone1_mas60: Number(r.zone1_mas60),
      zone2_mas80: Number(r.zone2_mas80),
      zone3_mas100: Number(r.zone3_mas100),
      zone4_asr20: Number(r.zone4_asr20),
      zone5_mss80: Number(r.zone5_mss80),
    };
  }).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
}

// 선수의 MAS/MSS를 직접 수정 (player_speed_zones 뷰가 override 값을 우선 반영해 속도 구간에 즉시 반영됨)
export async function updateSpeedCustomOverride(playerId: string, masValue: number, maxSpeed: number): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('player_speed_override')
    .upsert({ player_id: playerId, mas_value: masValue, max_speed: maxSpeed, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ── VALD 계측기 CSV 업로드 (ForceDecks / NordBord / ForceFrame / SmartSpeed) ──
// 모두 physical_report에 (player_id, test_date) 기준으로 부분 upsert된다.
// 같은 날짜에 여러 계측기 파일을 순서대로 올려도 서로 다른 컬럼만 채워지므로 값이 덮어써지지 않는다.

export async function importForcedecksCsvRows(rows: ForcedecksRow[], seasonYear: number, overrides?: Map<string, string>): Promise<number> {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows.map(r => ({ player_name: r.player_name, jersey_number: 0 })), seasonYear, overrides);

  const physicalRows = validRows.map(row => {
    const base: Record<string, unknown> = {
      player_id: playerMap.get(normalizeName(row.player_name)),
      test_date: row.test_date,
      weight: row.bodyWeight,
    };
    if (row.metric === 'cmj') {
      base.cmj_height = row.jumpHeight;
      base.cmj_peak_force = row.peakForce;
    } else {
      base.squat_jump_height = row.jumpHeight;
      base.squat_jump_peak_force = row.peakForce;
    }
    return base;
  }).filter(row => row.player_id);

  if (physicalRows.length === 0) return 0;
  const { error } = await client.from('physical_report').upsert(physicalRows, { onConflict: 'player_id,test_date' });
  if (error) throw error;
  return physicalRows.length;
}

export async function importNordbordCsvRows(rows: NordbordRow[], seasonYear: number, overrides?: Map<string, string>): Promise<number> {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows.map(r => ({ player_name: r.player_name, jersey_number: 0 })), seasonYear, overrides);

  // 같은 선수·날짜에 Nordic/ISO Prone이 각각 나올 수 있으므로 (player,date) 단위로 병합
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of validRows) {
    const playerId = playerMap.get(normalizeName(row.player_name));
    if (!playerId) continue;
    const key = `${playerId}__${row.test_date}`;
    const entry = merged.get(key) ?? { player_id: playerId, test_date: row.test_date };
    if (row.test === 'Nordic') {
      entry.nordic_curl_left = row.leftForce;
      entry.nordic_curl_right = row.rightForce;
    } else if (row.test === 'ISO Prone') {
      entry.ham_iso_left = row.leftForce;
      entry.ham_iso_right = row.rightForce;
    }
    merged.set(key, entry);
  }

  const physicalRows = [...merged.values()];
  if (physicalRows.length === 0) return 0;
  const { error } = await client.from('physical_report').upsert(physicalRows, { onConflict: 'player_id,test_date' });
  if (error) throw error;
  return physicalRows.length;
}

export async function importForceframeCsvRows(rows: ForceframeRow[], seasonYear: number, overrides?: Map<string, string>): Promise<number> {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows.map(r => ({ player_name: r.player_name, jersey_number: 0 })), seasonYear, overrides);

  // Squeeze(내전/ADD) + Pull(외전/ABD)을 (player,date) 단위로 병합
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of validRows) {
    const playerId = playerMap.get(normalizeName(row.player_name));
    if (!playerId) continue;
    const key = `${playerId}__${row.test_date}`;
    const entry = merged.get(key) ?? { player_id: playerId, test_date: row.test_date };
    if (row.direction === 'Squeeze') {
      entry.hip_ad_left = row.leftForce;
      entry.hip_ad_right = row.rightForce;
    } else if (row.direction === 'Pull') {
      entry.hip_ab_left = row.leftForce;
      entry.hip_ab_right = row.rightForce;
    }
    merged.set(key, entry);
  }

  const physicalRows = [...merged.values()];
  if (physicalRows.length === 0) return 0;
  const { error } = await client.from('physical_report').upsert(physicalRows, { onConflict: 'player_id,test_date' });
  if (error) throw error;
  return physicalRows.length;
}

export async function importSmartspeedCsvRows(rows: SmartspeedRow[], seasonYear: number, overrides?: Map<string, string>): Promise<number> {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows.map(r => ({ player_name: r.player_name, jersey_number: 0 })), seasonYear, overrides);

  // 선수·날짜·테스트별로 여러 트라이얼 중 최고 기록(최소 시간)만 사용
  const best = new Map<string, SmartspeedRow>();
  for (const row of validRows) {
    const key = `${normalizeName(row.player_name)}__${row.test_date}__${row.testName}`;
    const prev = best.get(key);
    if (!prev || row.total < prev.total) best.set(key, row);
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of best.values()) {
    const playerId = playerMap.get(normalizeName(row.player_name));
    if (!playerId) continue;
    const key = `${playerId}__${row.test_date}`;
    const entry = merged.get(key) ?? { player_id: playerId, test_date: row.test_date };
    if (row.testName === '30m Sprint') {
      entry.sprint_5m_time = row.split5m;
      entry.sprint_10m_time = row.split10m;
      entry.sprint_30m_time = row.total;
    } else if (row.testName === 'COD(With Ball)') {
      entry.cod_ball = row.total;
    } else if (row.testName === 'COD(Without Ball)') {
      entry.cod_run = row.total;
    }
    merged.set(key, entry);
  }

  const physicalRows = [...merged.values()];
  if (physicalRows.length === 0) return 0;
  const { error } = await client.from('physical_report').upsert(physicalRows, { onConflict: 'player_id,test_date' });
  if (error) throw error;
  return physicalRows.length;
}
