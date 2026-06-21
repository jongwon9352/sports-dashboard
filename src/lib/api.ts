import { supabase } from './supabase';
import type {
  PlayerWithAcwr, AcwrZone, AcwrDaily, TrainingDaily,
  TeamDailyAggregate, DailyReportRow, SidebarPlayer, MatchData,
} from '../types';
import { getAcwrZone, calculateMonotony } from '../utils/calculations';

type R = Record<string, any>;

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
