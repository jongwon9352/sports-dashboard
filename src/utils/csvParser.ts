import Papa from 'papaparse';

function parseNumber(val: string | undefined): number {
  if (!val || val === '-' || val === '') return 0;
  return parseFloat(val.replace(/,/g, '')) || 0;
}

function parseNullableNumber(val: string | undefined): number | null {
  if (!val || val === '-' || val === '') return null;
  const num = parseFloat(val.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

export function parseMatchFilename(filename: string): { date: string; event_type: string; opponent: string } | null {
  const name = filename.replace(/\.csv$/i, '').normalize('NFC').trim();
  if (name.endsWith('-세션별') || name.endsWith('-세션별데이터')) return null;
  const parts = name.split('-');
  if (parts.length >= 5) {
    const date = `${parts[0]}-${parts[1]}-${parts[2]}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const event_type = parts[3];
    const opponent = parts.slice(4).join('-');
    if (event_type && opponent) return { date, event_type, opponent };
  }
  return null;
}

export function parseMatchSessionFilename(filename: string): { date: string; event_type: string; opponent: string } | null {
  const name = filename.replace(/\.csv$/i, '').normalize('NFC').trim();
  if (!name.endsWith('-세션별') && !name.endsWith('-세션별데이터')) return null;
  const cleaned = name.replace(/-세션별데이터$/, '').replace(/-세션별$/, '');
  const parts = cleaned.split('-');
  if (parts.length < 4) return null;
  const date = `${parts[0]}-${parts[1]}-${parts[2]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const event_type = parts[3] || '';
  const opponent = parts.length >= 5 ? parts.slice(4).join('-') : '';
  return { date, event_type, opponent };
}

export interface ParsedMatchSessionRow {
  session_name: string;
  player_name: string;
  jersey_number: number;
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
}

export function parseMatchSessionCsv(csvText: string): ParsedMatchSessionRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  return rows.slice(1).map(row => ({
    session_name: row[0] || '',
    player_name: row[1] || '',
    jersey_number: parseNumber(row[2]),
    duration_min: parseNumber(row[3]),
    total_distance: parseNumber(row[4]),
    m_per_min: parseNumber(row[5]),
    hsr_distance: parseNumber(row[6]),
    hsr_custom: parseNumber(row[7]),
    sprint_distance: parseNumber(row[8]),
    sprint_custom: parseNumber(row[9]),
    sprint_count: parseNumber(row[10]),
    sprint_count_custom: parseNumber(row[11]),
    acc_count: parseNumber(row[12]),
    dec_count: parseNumber(row[13]),
    acd_load: parseNumber(row[14]),
    max_speed: parseNumber(row[15]),
  })).filter(r => r.session_name && r.player_name);
}

export function extractDateFromFilename(filename: string): string {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const tsMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (tsMatch) return `${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]}`;
  return new Date().toISOString().split('T')[0];
}

export interface ParsedSessionRow {
  session_name: string;
  player_name: string;
  jersey_number: number;
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
}

export function parseSessionCsv(csvText: string): ParsedSessionRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  return rows.slice(1).map(row => ({
    session_name: row[0] || '',
    player_name: row[1] || '',
    jersey_number: parseNumber(row[2]),
    duration_min: parseNumber(row[3]),
    total_distance: parseNumber(row[4]),
    m_per_min: parseNumber(row[5]),
    hsr_distance: parseNumber(row[6]),
    hsr_custom: parseNumber(row[7]),
    sprint_distance: parseNumber(row[8]),
    sprint_custom: parseNumber(row[9]),
    sprint_count: parseNumber(row[10]),
    sprint_count_custom: parseNumber(row[11]),
    acc_count: parseNumber(row[12]),
    dec_count: parseNumber(row[13]),
    acd_load: parseNumber(row[14]),
    max_speed: parseNumber(row[15]),
  }));
}

export interface ParsedDailyRow {
  player_name: string;
  jersey_number: number;
  duration_min: number;
  rpe: number | null;
  total_distance: number;
  speed_zone_1: number;
  speed_zone_2: number;
  speed_zone_3: number;
  speed_zone_4: number;
  speed_zone_5: number;
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
}

export function parseDailyCsv(csvText: string): ParsedDailyRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  return rows.slice(1).map(row => ({
    player_name: row[0] || '',
    jersey_number: parseNumber(row[1]),
    duration_min: parseNumber(row[2]),
    rpe: parseNullableNumber(row[3]),
    total_distance: parseNumber(row[4]),
    speed_zone_1: parseNumber(row[5]),
    speed_zone_2: parseNumber(row[6]),
    speed_zone_3: parseNumber(row[7]),
    speed_zone_4: parseNumber(row[8]),
    speed_zone_5: parseNumber(row[9]),
    m_per_min: parseNumber(row[10]),
    hsr_distance: parseNumber(row[11]),
    hsr_custom: parseNumber(row[12]),
    sprint_distance: parseNumber(row[13]),
    sprint_custom: parseNumber(row[14]),
    sprint_count: parseNumber(row[15]),
    sprint_count_custom: parseNumber(row[16]),
    acc_count: parseNumber(row[17]),
    dec_count: parseNumber(row[18]),
    acd_load: parseNumber(row[19]),
    max_speed: parseNumber(row[20]),
  }));
}
