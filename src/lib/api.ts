import { supabase } from './supabase';
import type {
  PlayerWithAcwr, AcwrZone, AcwrDaily, TrainingDaily,
  TeamDailyAggregate, DailyReportRow, SidebarPlayer, MatchData,
} from '../types';
import {
  calculateAcuteEwma,
  calculateAcwr,
  calculateChronicEwma,
  calculateMonotony,
  getAcwrZone,
} from '../utils/calculations';
import type { ParsedDailyRow, ParsedSessionRow } from '../utils/csvParser';

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

  const { error } = await client
    .from('training_daily')
    .upsert(dailyRows, { onConflict: 'player_id,training_date' });
  if (error) throw error;

  await recalculatePlayerAcwr([...new Set(dailyRows.map(row => row.player_id as string))]);
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

  const dates = new Set<string>();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk } = await supabase
      .from('training_daily')
      .select('training_date')
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

  const { data } = await supabase
    .from('training_daily')
    .select('player_id, total_distance, hsr_distance, sprint_distance, rpe, m_per_min, acc_count, dec_count, max_speed, daily_training_load, players(name, jersey_number, position)')
    .eq('training_date', date)
    .order('total_distance', { ascending: false });

  if (!data) return [];

  return (data as R[]).map(row => ({
    player_id: row.player_id,
    player_name: row.players?.name ?? '',
    jersey_number: row.players?.jersey_number,
    position: row.players?.position,
    total_distance: Number(row.total_distance) || 0,
    hsr_distance: Number(row.hsr_distance) || 0,
    sprint_distance: Number(row.sprint_distance) || 0,
    rpe: row.rpe != null ? Number(row.rpe) : null,
    m_per_min: Number(row.m_per_min) || 0,
    acc_count: Number(row.acc_count) || 0,
    dec_count: Number(row.dec_count) || 0,
    max_speed: Number(row.max_speed) || 0,
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

  const rows: R[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: chunk } = await supabase
      .from('training_daily')
      .select('training_date, rpe, player_id, players(name)')
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
