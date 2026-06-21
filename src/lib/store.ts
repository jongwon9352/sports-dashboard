import { useState, useCallback } from 'react';
import type { Player, TrainingSession, TrainingDaily, AcwrDaily, PlayerWithAcwr, PhysicalReport } from '../types';
import { calculateAcuteEwma, calculateChronicEwma, calculateAcwr, getAcwrZone, calculateMonotony } from '../utils/calculations';
import type { ParsedSessionRow, ParsedDailyRow } from '../utils/csvParser';

let playersStore: Player[] = [];
let sessionsStore: TrainingSession[] = [];
let dailyStore: TrainingDaily[] = [];
let acwrStore: AcwrDaily[] = [];
let physicalStore: PhysicalReport[] = [];
let listeners: (() => void)[] = [];

function notify() {
  listeners.forEach(fn => fn());
}

export function useStore() {
  const [, setTick] = useState(0);

  const subscribe = useCallback(() => {
    const listener = () => setTick(t => t + 1);
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
  }, []);

  useState(() => {
    const unsub = subscribe();
    return unsub;
  });

  return {
    players: playersStore,
    sessions: sessionsStore,
    dailyData: dailyStore,
    acwrData: acwrStore,
    physicalReports: physicalStore,
  };
}

function findOrCreatePlayer(name: string, jerseyNumber: number): Player {
  const normalized = name.normalize('NFC').trim();
  let player = playersStore.find(p => p.name.normalize('NFC').trim() === normalized);
  if (player) return player;

  player = {
    id: crypto.randomUUID(),
    name: normalized,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  playersStore.push(player);
  return player;
}

export function importSessionData(rows: ParsedSessionRow[], date: string) {
  for (const row of rows) {
    if (!row.player_name) continue;
    const player = findOrCreatePlayer(row.player_name, row.jersey_number);
    sessionsStore.push({
      id: crypto.randomUUID(),
      player_id: player.id,
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
      created_at: new Date().toISOString(),
    });
  }
  notify();
}

export function importDailyData(rows: ParsedDailyRow[], date: string) {
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][new Date(date).getDay()];

  for (const row of rows) {
    if (!row.player_name) continue;
    const player = findOrCreatePlayer(row.player_name, row.jersey_number);

    const existing = dailyStore.findIndex(
      d => d.player_id === player.id && d.training_date === date
    );
    if (existing >= 0) dailyStore.splice(existing, 1);

    const dtl = row.rpe !== null ? row.duration_min * row.rpe : null;

    dailyStore.push({
      id: crypto.randomUUID(),
      player_id: player.id,
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
      daily_training_load: dtl,
      created_at: new Date().toISOString(),
    });
  }

  recalculateAcwr();
  notify();
}

export function updatePlayerRpe(playerId: string, date: string, rpe: number) {
  const entry = dailyStore.find(d => d.player_id === playerId && d.training_date === date);
  if (entry) {
    entry.rpe = rpe;
    entry.daily_training_load = entry.duration_min * rpe;
  }
  recalculateAcwr();
  notify();
}

function recalculateAcwr() {
  acwrStore = [];

  for (const player of playersStore) {
    const playerDaily = dailyStore
      .filter(d => d.player_id === player.id && d.daily_training_load !== null)
      .sort((a, b) => a.training_date.localeCompare(b.training_date));

    if (playerDaily.length === 0) continue;

    const startDate = new Date(playerDaily[0].training_date);
    const endDate = new Date(playerDaily[playerDaily.length - 1].training_date);
    let prevAcute: number | null = null;
    let prevChronic: number | null = null;
    let dayCount = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayEntry = playerDaily.find(dd => dd.training_date === dateStr);
      const load = dayEntry?.daily_training_load ?? 0;

      const acute = calculateAcuteEwma(load, prevAcute);
      const chronic = calculateChronicEwma(load, prevChronic);
      const acwr = calculateAcwr(acute, chronic);
      dayCount++;

      acwrStore.push({
        id: crypto.randomUUID(),
        player_id: player.id,
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
  }
}

export function getPlayersWithAcwr(): PlayerWithAcwr[] {
  return playersStore.map(player => {
    const playerAcwr = acwrStore
      .filter(a => a.player_id === player.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    const latestAcwr = playerAcwr[0];

    const last7 = dailyStore
      .filter(d => d.player_id === player.id && d.daily_training_load !== null)
      .sort((a, b) => b.training_date.localeCompare(a.training_date))
      .slice(0, 7)
      .map(d => d.daily_training_load!);

    const monotony = calculateMonotony(last7);

    return {
      ...player,
      acwr_data: latestAcwr,
      acwr_zone: latestAcwr
        ? getAcwrZone(latestAcwr.acwr, latestAcwr.data_sufficient, player.maturity_status)
        : 'insufficient',
      monotony,
    };
  });
}

export function getPlayerAcwrHistory(playerId: string): AcwrDaily[] {
  return acwrStore
    .filter(a => a.player_id === playerId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getPlayerSessions(playerId: string): TrainingSession[] {
  return sessionsStore
    .filter(s => s.player_id === playerId)
    .sort((a, b) => b.training_date.localeCompare(a.training_date));
}

export function getPlayerDailyData(playerId: string): TrainingDaily[] {
  return dailyStore
    .filter(d => d.player_id === playerId)
    .sort((a, b) => b.training_date.localeCompare(a.training_date));
}
