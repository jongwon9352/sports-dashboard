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

export interface ParsedPhysicalRow {
  player_name: string;
  nordic_curl_left: number | null;
  nordic_curl_right: number | null;
  hip_ab_left: number | null;
  hip_ab_right: number | null;
  hip_ad_left: number | null;
  hip_ad_right: number | null;
  sprint_5m_time: number | null;
  sprint_10m_time: number | null;
  sprint_30m_time: number | null;
  cmj_height: number | null;
  rebound_jump_height: number | null;
  squat_jump_height: number | null;
  cod_run: number | null;
  cod_ball: number | null;
  mas_value: number | null;
  mss_value: number | null;
}

// CSV 컬럼 순서: 이름, Nordic(좌), Nordic(우), 외전(좌), 외전(우), 내전(좌), 내전(우),
// 5m(s), 10m(s), 30m(s), CMJ(cm), 재점프(cm), Squat Jump(cm), 방향전환(런), 방향전환(볼), MAS, MSS
export function parsePhysicalCsv(csvText: string): ParsedPhysicalRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  return rows.slice(1).map(row => ({
    player_name: row[0] || '',
    nordic_curl_left: parseNullableNumber(row[1]),
    nordic_curl_right: parseNullableNumber(row[2]),
    hip_ab_left: parseNullableNumber(row[3]),
    hip_ab_right: parseNullableNumber(row[4]),
    hip_ad_left: parseNullableNumber(row[5]),
    hip_ad_right: parseNullableNumber(row[6]),
    sprint_5m_time: parseNullableNumber(row[7]),
    sprint_10m_time: parseNullableNumber(row[8]),
    sprint_30m_time: parseNullableNumber(row[9]),
    cmj_height: parseNullableNumber(row[10]),
    rebound_jump_height: parseNullableNumber(row[11]),
    squat_jump_height: parseNullableNumber(row[12]),
    cod_run: parseNullableNumber(row[13]),
    cod_ball: parseNullableNumber(row[14]),
    mas_value: parseNullableNumber(row[15]),
    mss_value: parseNullableNumber(row[16]),
  })).filter(r => r.player_name);
}

export interface MaturitySheetRow {
  timestamp: string;
  player_name: string;
  height: number | null;
  weight: number | null;
  chair_height: number | null;
  sitting_height: number | null;
  mother_height: number | null;
  father_height: number | null;
}

// 구글 폼 응답 시트: 타임스탬프,선수 이름,선수 신장(cm),선수 몸무게(kg),의자 높이(cm),앉은 키,엄마 신장,아빠 신장
export function parseMaturitySheetCsv(csvText: string): MaturitySheetRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  return rows.slice(1).map(row => ({
    timestamp: row[0] || '',
    player_name: row[1] || '',
    height: parseNullableNumber(row[2]),
    weight: parseNullableNumber(row[3]),
    chair_height: parseNullableNumber(row[4]),
    sitting_height: parseNullableNumber(row[5]),
    mother_height: parseNullableNumber(row[6]),
    father_height: parseNullableNumber(row[7]),
  })).filter(r => r.player_name);
}

// 구글 폼 타임스탬프("2024. 3. 9 오후 3:45:00")를 YYYY-MM-DD로 변환
export function parseSheetTimestampToDate(timestamp: string): string | null {
  const m = timestamp.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export interface ParsedBodyCompositionRow {
  player_name: string;
  height: number | null;
  weight: number | null;
}

// CSV 컬럼 순서: 이름, 신장(cm), 몸무게(kg)
export function parseBodyCompositionCsv(csvText: string): ParsedBodyCompositionRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  return rows.slice(1).map(row => ({
    player_name: row[0] || '',
    height: parseNullableNumber(row[1]),
    weight: parseNullableNumber(row[2]),
  })).filter(r => r.player_name);
}
