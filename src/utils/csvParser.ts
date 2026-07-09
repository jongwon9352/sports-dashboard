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

  const parsed = rows.slice(1).map(row => ({
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

  // 같은 선수가 같은 세션(전반/후반)에 교체 출전 등으로 여러 줄에 나뉘어 기록된 경우 합산
  // (player_id, match_date, opponent, session_name) 유니크 제약 위반으로 upsert가 실패하는 것을 방지
  const merged = new Map<string, ParsedMatchSessionRow>();
  for (const row of parsed) {
    const key = `${row.player_name}__${row.session_name}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row });
      continue;
    }
    existing.duration_min += row.duration_min;
    existing.total_distance += row.total_distance;
    existing.hsr_distance += row.hsr_distance;
    existing.hsr_custom += row.hsr_custom;
    existing.sprint_distance += row.sprint_distance;
    existing.sprint_custom += row.sprint_custom;
    existing.sprint_count += row.sprint_count;
    existing.sprint_count_custom += row.sprint_count_custom;
    existing.acc_count += row.acc_count;
    existing.dec_count += row.dec_count;
    existing.acd_load += row.acd_load;
    existing.max_speed = Math.max(existing.max_speed, row.max_speed);
    existing.m_per_min = existing.duration_min > 0 ? existing.total_distance / existing.duration_min : 0;
  }

  return [...merged.values()];
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
  cmj_peak_force: number | null;
  squat_jump_peak_force: number | null;
}

// CSV 컬럼 순서: 이름, Nordic(좌), Nordic(우), 외전(좌), 외전(우), 내전(좌), 내전(우),
// 5m(s), 10m(s), 30m(s), CMJ(cm), 재점프(cm), Squat Jump(cm), 방향전환(런), 방향전환(볼), MAS, MSS,
// CMJ Peak Force(N), Squat Jump Peak Force(N)
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
    cmj_peak_force: parseNullableNumber(row[17]),
    squat_jump_peak_force: parseNullableNumber(row[18]),
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

// ── VALD 계측기 CSV 파서 (ForceDecks / NordBord / ForceFrame / SmartSpeed) ──
function stripTeamPrefix(name: string): string {
  return name.replace(/^대전U?\d*\s*/, '').trim();
}

// "2026/06/08" -> "2026-06-08"
function parseSlashDate(d: string): string {
  return d.replace(/\//g, '-');
}

// SmartSpeed 날짜는 DD/MM/YYYY: "08/06/2026" -> "2026-06-08"
function parseSmartspeedDate(d: string): string {
  const [dd, mm, yyyy] = d.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

export interface ForcedecksRow {
  player_name: string;
  test_date: string;
  metric: 'cmj' | 'sj';
  jumpHeight: number;
  bodyWeight: number;
  peakForce: number | null;
}

// forcedecks-test-export: Test Type 컬럼으로 SJ/CMJ 판별
export function parseForcedecksCsv(csvText: string): ForcedecksRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length === 0) return [];

  const heightKeyCmj = 'Jump Height (Flight Time) [cm] ';
  const heightKeySj = 'Jump Height (Imp-Mom) [cm] ';
  const isCmj = heightKeyCmj in rows[0];
  const heightKey = isCmj ? heightKeyCmj : heightKeySj;
  const metric: 'cmj' | 'sj' = isCmj ? 'cmj' : 'sj';
  // CMJ 리포트는 "Takeoff Peak Force [N]", SJ 리포트는 "Force at Peak Power [N]" 컬럼명을 쓴다.
  const peakForceKey = isCmj ? 'Takeoff Peak Force [N] ' : 'Force at Peak Power [N] ';

  return rows.filter(r => r['Name']).map(r => ({
    player_name: stripTeamPrefix(r['Name']),
    test_date: parseSlashDate(r['Date']),
    metric,
    jumpHeight: parseFloat(r[heightKey]) || 0,
    bodyWeight: parseFloat(r['BW [KG]']) || 0,
    peakForce: parseNullableNumber(r[peakForceKey]),
  }));
}

export interface NordbordRow {
  player_name: string;
  test_date: string;
  test: 'Nordic' | 'ISO Prone' | string;
  leftForce: number;
  rightForce: number;
}

// nordbord-test-export: Test 컬럼으로 Nordic(HAM ECC)/ISO Prone(HAM ISO) 판별
export function parseNordbordCsv(csvText: string): NordbordRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  return result.data.filter(r => r['Name']).map(r => ({
    player_name: stripTeamPrefix(r['Name']),
    test_date: parseSlashDate(r['Date UTC']),
    test: r['Test'],
    leftForce: parseFloat(r['L Max Force (N)']) || 0,
    rightForce: parseFloat(r['R Max Force (N)']) || 0,
  }));
}

export interface ForceframeRow {
  player_name: string;
  test_date: string;
  direction: 'Pull' | 'Squeeze' | string;
  leftForce: number;
  rightForce: number;
}

// forceframe-test-export: Test="Hip AD/AB" 행만 사용, Direction="Squeeze"=내전(ADD), "Pull"=외전(ABD)
export function parseForceframeCsv(csvText: string): ForceframeRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  return result.data
    .filter(r => r['Name'] && r['Test'] === 'Hip AD/AB')
    .map(r => ({
      player_name: stripTeamPrefix(r['Name']),
      test_date: parseSlashDate(r['Date']),
      direction: r['Direction'],
      leftForce: parseFloat(r['L Max Force (N)']) || 0,
      rightForce: parseFloat(r['R Max Force (N)']) || 0,
    }));
}

export interface SmartspeedRow {
  player_name: string;
  test_date: string;
  testName: '30m Sprint' | 'COD(With Ball)' | 'COD(Without Ball)' | string;
  split5m: number | null;
  split10m: number | null;
  total: number;
}

// smartspeed-test-export: Name 컬럼으로 30m Sprint/COD(With·Without Ball) 판별
export function parseSmartspeedCsv(csvText: string): SmartspeedRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  return result.data
    .filter(r => r['FamilyName'])
    .map(r => ({
      player_name: stripTeamPrefix(r['FamilyName']),
      test_date: parseSmartspeedDate(r['Date']),
      testName: r['Name'],
      split5m: r['Cumulative1'] ? parseFloat(r['Cumulative1']) : null,
      split10m: r['Cumulative2'] ? parseFloat(r['Cumulative2']) : null,
      total: parseFloat(r['Total']) || 0,
    }));
}
