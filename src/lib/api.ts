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
import type { ParsedDailyRow, ParsedSessionRow, ParsedMatchSessionRow } from '../utils/csvParser';
import { parseMatchFilename, parseMatchSessionFilename } from '../utils/csvParser';

const GOOGLE_SHEET_PUB_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAl_Jr193NUoZilorIYC7VWfazt4r_CTFRyHycEOWz3DFu_YEUhNGhaIqW2_5R81WrSg1J42WlntRm/pub?gid=179117944&single=true&output=csv';

export interface GoogleSheetRpe {
  date: string;
  name: string;
  rpe: number;
}

function parseGoogleTimestamp(ts: string): string {
  const m = ts.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
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
    const rpe = parseFloat(cols[1]);
    const name = cols[2].normalize('NFC').trim();
    if (date && name && !isNaN(rpe)) {
      results.push({ date, name, rpe });
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
    grade: 'U15',
    birth_date: '',
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

async function getOrCreatePlayers(rows: { player_name: string; jersey_number: number }[]) {
  const client = requireSupabase();
  const requested = new Map<string, number>();

  for (const row of rows) {
    const name = normalizeName(row.player_name);
    if (name && !requested.has(name)) requested.set(name, row.jersey_number);
  }

  if (requested.size === 0) return new Map<string, string>();

  const names = [...requested.keys()];
  const { data: existing, error: fetchError } = await client
    .from('players')
    .select('id, name')
    .in('name', names);
  if (fetchError) throw fetchError;

  const playerMap = new Map<string, string>();
  for (const player of (existing as R[]) ?? []) {
    playerMap.set(normalizeName(player.name), player.id);
  }

  const missing = names
    .filter(name => !playerMap.has(name))
    .map(name => defaultPlayer(name, requested.get(name) ?? 0));

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await client
      .from('players')
      .insert(missing)
      .select('id, name');
    if (insertError) throw insertError;

    for (const player of (inserted as R[]) ?? []) {
      playerMap.set(normalizeName(player.name), player.id);
    }
  }

  return playerMap;
}

export async function importSessionCsvRows(rows: ParsedSessionRow[], date: string) {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows);
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

export async function importDailyCsvRows(rows: ParsedDailyRow[], date: string) {
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows);
  const now = new Date().toISOString();
  const parsedDate = new Date(date);
  const dayOfWeek = dayNames[parsedDate.getDay()] ?? '';

  const dailyRows = validRows.map(row => {
    const playerId = playerMap.get(normalizeName(row.player_name));
    const dailyTrainingLoad = row.rpe !== null ? row.duration_min * row.rpe : null;

    return {
      id: crypto.randomUUID(),
      player_id: playerId,
      training_date: date,
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
  const { data: existing } = await client
    .from('training_daily')
    .select('player_id, duration_min, total_distance, m_per_min, speed_zone_1, speed_zone_2, speed_zone_3, speed_zone_4, speed_zone_5, hsr_distance, hsr_custom, sprint_distance, sprint_custom, sprint_count, sprint_count_custom, acc_count, dec_count, acd_load, max_speed, daily_training_load')
    .eq('training_date', date)
    .in('player_id', playerIds);

  const existMap = new Map((existing ?? []).map((e: any) => [e.player_id, e]));

  const mergedRows = dailyRows.map(row => {
    const prev = existMap.get(row.player_id);
    if (!prev) return row;
    const add = (a: number, b: number) => (Number(a) || 0) + (Number(b) || 0);
    return {
      ...row,
      duration_min: add(prev.duration_min, row.duration_min),
      total_distance: add(prev.total_distance, row.total_distance),
      speed_zone_1: add(prev.speed_zone_1, row.speed_zone_1),
      speed_zone_2: add(prev.speed_zone_2, row.speed_zone_2),
      speed_zone_3: add(prev.speed_zone_3, row.speed_zone_3),
      speed_zone_4: add(prev.speed_zone_4, row.speed_zone_4),
      speed_zone_5: add(prev.speed_zone_5, row.speed_zone_5),
      hsr_distance: add(prev.hsr_distance, row.hsr_distance),
      hsr_custom: add(prev.hsr_custom, row.hsr_custom),
      sprint_distance: add(prev.sprint_distance, row.sprint_distance),
      sprint_custom: add(prev.sprint_custom, row.sprint_custom),
      sprint_count: add(prev.sprint_count, row.sprint_count),
      sprint_count_custom: add(prev.sprint_count_custom, row.sprint_count_custom),
      acc_count: add(prev.acc_count, row.acc_count),
      dec_count: add(prev.dec_count, row.dec_count),
      acd_load: add(prev.acd_load, row.acd_load),
      max_speed: Math.max(Number(prev.max_speed) || 0, row.max_speed),
      m_per_min: add(prev.total_distance, row.total_distance) / add(prev.duration_min, row.duration_min) || 0,
      daily_training_load: row.rpe !== null ? add(prev.duration_min, row.duration_min) * (row.rpe as number) : (prev.daily_training_load ?? null),
    };
  });

  const { error } = await client
    .from('training_daily')
    .upsert(mergedRows, { onConflict: 'player_id,training_date' });
  if (error) throw error;

  await recalculatePlayerAcwr(playerIds);
}

export async function importMatchCsvRows(rows: ParsedDailyRow[], filename: string) {
  const matchInfo = parseMatchFilename(filename);
  if (!matchInfo) throw new Error('파일명에서 경기 정보를 추출할 수 없습니다. (형식: 날짜-대회-상대.csv)');

  const { date, event_type, opponent } = matchInfo;
  const client = requireSupabase();
  const validRows = rows.filter(row => normalizeName(row.player_name));
  const playerMap = await getOrCreatePlayers(validRows);
  const now = new Date().toISOString();

  const matchRows = validRows.map(row => {
    const playerId = playerMap.get(normalizeName(row.player_name));
    return {
      id: crypto.randomUUID(),
      player_id: playerId,
      match_date: date,
      opponent,
      event_type,
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

  // training_daily에도 저장 (데일리/위클리 리포트 반영)
  await importDailyCsvRows(rows, date);

  return matchRows.length;
}

async function recalculatePlayerAcwr(playerIds: string[]) {
  const client = requireSupabase();

  for (const playerId of playerIds) {
    const { data, error } = await client
      .from('training_daily')
      .select('training_date, daily_training_load')
      .eq('player_id', playerId)
      .order('training_date', { ascending: true });
    if (error) throw error;

    const playerDaily = ((data as R[]) ?? [])
      .filter(row => row.daily_training_load !== null)
      .sort((a, b) => String(a.training_date).localeCompare(String(b.training_date)));
    if (playerDaily.length === 0) continue;

    const loadByDate = new Map(
      playerDaily.map(row => [String(row.training_date), Number(row.daily_training_load) || 0])
    );
    const startDate = new Date(playerDaily[0].training_date);
    const endDate = new Date(playerDaily[playerDaily.length - 1].training_date);
    const acwrRows = [];
    let prevAcute: number | null = null;
    let prevChronic: number | null = null;
    let dayCount = 0;

    for (const d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
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
    .select('player_id, duration_min, total_distance, m_per_min, hsr_distance, hsr_custom, sprint_distance, sprint_custom, sprint_count, sprint_count_custom, acc_count, dec_count, acd_load, max_speed, rpe, daily_training_load, players(name, jersey_number, position)')
    .eq('training_date', date)
    .in('player_id', playerIds)
    .order('total_distance', { ascending: false });

  if (!data) return [];

  return (data as R[]).map(row => ({
    player_id: row.player_id,
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
  }));
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

  if (!rows.length) return { teamTrend: [], playerAvgs: [], distribution: [] };

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

export async function addPlayer(player: {
  name: string;
  jersey_number: number;
  position: string;
  grade: string;
}) {
  const client = requireSupabase();
  const now = new Date().toISOString();
  const { error } = await client.from('players').insert({
    id: crypto.randomUUID(),
    name: player.name,
    jersey_number: player.jersey_number,
    position: player.position,
    grade: player.grade,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
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
      .select('id, player_id, training_date, duration_min, rpe, total_distance, m_per_min, hsr_distance, hsr_custom, sprint_distance, sprint_custom, sprint_count, sprint_count_custom, acc_count, dec_count, acd_load, max_speed, speed_zone_1, speed_zone_2, speed_zone_3, speed_zone_4, speed_zone_5, players(name, jersey_number)')
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
  const { error } = await client
    .from('training_daily')
    .update({ rpe, daily_training_load: dailyLoad })
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

export async function importMatchSessionCsvRows(rows: ParsedMatchSessionRow[], filename: string): Promise<number> {
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
  const playerMap = await getOrCreatePlayers(validRows);
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
}

export async function fetchTeamAcwrData(days: number = 60): Promise<{
  tl: TeamAcwrSeries[];
  td: TeamAcwrSeries[];
  hsr: TeamAcwrSeries[];
  sprint: TeamAcwrSeries[];
  acd: TeamAcwrSeries[];
}> {
  if (!supabase) return { tl: [], td: [], hsr: [], sprint: [], acd: [] };

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);

  // Step 1: Get eligible players (2,3학년 = U14, U15 in players table)
  const { data: eligiblePlayers } = await supabase
    .from('players')
    .select('id')
    .in('grade', ['U15', 'U14', '2학년', '3학년']);
  const eligibleIds = new Set((eligiblePlayers ?? []).map((p: any) => p.id as string));

  // Step 2: Get daily_report_config - players marked as 3학년/U15/U14 training type
  const { data: configs } = await supabase
    .from('daily_report_config')
    .select('training_date, player_types');

  const grade3Tags = ['3학년'];
  const grade3PlayersByDate = new Map<string, Set<string>>();
  if (configs) {
    for (const cfg of configs as any[]) {
      const types = cfg.player_types as Record<string, string>;
      if (!types) continue;
      const ids = Object.entries(types)
        .filter(([, t]) => grade3Tags.includes(t))
        .map(([id]) => id);
      if (ids.length > 0) grade3PlayersByDate.set(cfg.training_date, new Set(ids));
    }
  }

  // Fetch training_daily in chunks to avoid Supabase 1000-row limit
  const dailyData: any[] = [];
  const chunkSize = 14;
  for (let offset = 0; offset < days; offset += chunkSize) {
    const cStart = new Date(startDate);
    cStart.setDate(startDate.getDate() + offset);
    const cEnd = new Date(startDate);
    cEnd.setDate(startDate.getDate() + offset + chunkSize - 1);
    if (cEnd > today) cEnd.setTime(today.getTime());

    const { data: chunk } = await supabase
      .from('training_daily')
      .select('training_date, player_id, daily_training_load, duration_min, rpe, total_distance, hsr_distance, sprint_distance, acd_load')
      .gte('training_date', cStart.toISOString().split('T')[0])
      .lte('training_date', cEnd.toISOString().split('T')[0])
      .order('training_date', { ascending: true });
    if (chunk) dailyData.push(...chunk);
  }

  if (dailyData.length === 0) return { tl: [], td: [], hsr: [], sprint: [], acd: [] };

  // Group by date and compute team average for 3학년 players
  const dateMap = new Map<string, TeamAcwrDayData>();
  const byDate = new Map<string, any[]>();
  for (const row of dailyData as any[]) {
    const d = row.training_date as string;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(row);
  }

  // Fill all dates from start to today
  const allDates: string[] = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().split('T')[0]);
  }

  for (const date of allDates) {
    const rows = byDate.get(date) ?? [];
    const grade3Ids = grade3PlayersByDate.get(date);
    const filtered = grade3Ids
      ? rows.filter((r: any) => grade3Ids.has(r.player_id))
      : rows.filter((r: any) => eligibleIds.has(r.player_id));

    const avg = (fn: (r: any) => number) => {
      if (filtered.length === 0) return 0;
      return filtered.reduce((s: number, r: any) => s + fn(r), 0) / filtered.length;
    };

    const tlVal = avg(r => {
      const dtl = Number(r.daily_training_load);
      if (dtl > 0) return dtl;
      const dur = Number(r.duration_min) || 0;
      const rpe = Number(r.rpe) || 0;
      return dur * rpe;
    });

    dateMap.set(date, {
      date,
      tl: tlVal,
      td: avg(r => Number(r.total_distance) || 0),
      hsr: avg(r => Number(r.hsr_distance) || 0),
      sprint: avg(r => Number(r.sprint_distance) || 0),
      acd: avg(r => Number(r.acd_load) || 0),
    });
  }

  // Compute EWMA for each metric
  function computeEwma(dailyValues: { date: string; value: number }[]): TeamAcwrSeries[] {
    let acute: number | null = null;
    let chronic: number | null = null;
    return dailyValues.map(({ date, value }) => {
      if (acute === null) {
        acute = value;
        chronic = value;
      } else {
        acute = acute * 0.25 + value * 0.75;
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
