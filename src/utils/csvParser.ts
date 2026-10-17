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

  // 운동부하 CSV와 같은 이유로 열을 헤더에서 찾는다 — 수출 형식이 바뀌며 앞에 '등번호'·'포지션'이
  // 붙으면 위치 고정 파싱이 밀려 이름 칸에 등번호가 들어간다(2026-10-17, 유령 선수 12명).
  // 여기선 열 이름을 전부 찾는다. 이 형식은 운동부하와 꼬리 순서가 달라 상대 위치를 믿을 수 없다.
  // 헤더를 못 찾는 열은 예전 고정 위치로 떨어진다.
  const header = (rows[0] ?? []).map(h => (h ?? '').replace(/^\uFEFF/, '').trim());
  const col = (fallback: number, ...names: string[]) => {
    const i = header.findIndex(h => names.includes(h));
    return i >= 0 ? i : fallback;
  };
  const c = {
    session: col(0, '세션 이름', '세션'),
    name: col(1, '선수 이름', '이름'),
    jersey: col(2, '등번호'),
    duration: col(3, '뛴 시간 (min)'),
    distance: col(4, '뛴 거리 (m)'),
    mPerMin: col(5, '분당 뛴 거리 (m/min)'),
    hsr: col(6, 'HSR 거리 (m)'),
    hsrCustom: col(7, 'HSR 거리 (Custom) (m)'),
    sprint: col(8, 'Sprint 거리 (m)'),
    sprintCustom: col(9, 'Sprint 거리 (Custom) (m)'),
    sprintCount: col(10, 'Sprint 횟수 (times)'),
    sprintCountCustom: col(11, 'Sprint 횟수 (Custom) (times)'),
    acc: col(12, 'Medium Acceleration 횟수 (times)'),
    dec: col(13, 'Medium Deceleration 횟수 (times)'),
    acd: col(14, 'ACD Load'),
    maxSpeed: col(15, '최고 속도 (km/h)'),
  };

  const parsed = rows.slice(1).map(row => ({
    session_name: row[c.session] || '',
    player_name: row[c.name] || '',
    jersey_number: parseNumber(row[c.jersey]),
    duration_min: parseNumber(row[c.duration]),
    total_distance: parseNumber(row[c.distance]),
    m_per_min: parseNumber(row[c.mPerMin]),
    hsr_distance: parseNumber(row[c.hsr]),
    hsr_custom: parseNumber(row[c.hsrCustom]),
    sprint_distance: parseNumber(row[c.sprint]),
    sprint_custom: parseNumber(row[c.sprintCustom]),
    sprint_count: parseNumber(row[c.sprintCount]),
    sprint_count_custom: parseNumber(row[c.sprintCountCustom]),
    acc_count: parseNumber(row[c.acc]),
    dec_count: parseNumber(row[c.dec]),
    acd_load: parseNumber(row[c.acd]),
    max_speed: parseNumber(row[c.maxSpeed]),
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

// 열 위치를 헤더에서 찾는다. 2026-10-14 수출본부터 앞에 '등번호'·'포지션' 열이 붙고
// 이름 헤더가 '이름' → '선수 이름' 으로 바뀌면서 위치 고정 파싱이 통째로 한 칸 밀렸다
// (이름 칸에 등번호가 들어가 등번호 이름의 유령 선수 29명이 생성됐다).
// 예전 파일도 세션별 화면에서 csv_content 를 다시 파싱하므로 두 형식을 모두 읽어야 한다.
// '뛴 시간 (min)' 이후 열 순서는 두 형식이 같아서 그 위치만 찾으면 나머지는 상대 위치로 따라간다.
export function parseDailyCsv(csvText: string): ParsedDailyRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  const header = (rows[0] ?? []).map(h => (h ?? '').replace(/^\uFEFF/, '').trim());
  const idxOf = (...names: string[]) => header.findIndex(h => names.includes(h));
  const found = (i: number, fallback: number) => (i >= 0 ? i : fallback);

  const nameIdx = found(idxOf('선수 이름', '이름'), 0);
  const jerseyIdx = found(idxOf('등번호'), 1);
  const base = found(idxOf('뛴 시간 (min)'), 2); // 이 열부터는 두 형식의 순서가 동일하다

  return rows.slice(1).map(row => ({
    player_name: row[nameIdx] || '',
    jersey_number: parseNumber(row[jerseyIdx]),
    duration_min: parseNumber(row[base]),
    rpe: parseNullableNumber(row[base + 1]),
    total_distance: parseNumber(row[base + 2]),
    speed_zone_1: parseNumber(row[base + 3]),
    speed_zone_2: parseNumber(row[base + 4]),
    speed_zone_3: parseNumber(row[base + 5]),
    speed_zone_4: parseNumber(row[base + 6]),
    speed_zone_5: parseNumber(row[base + 7]),
    m_per_min: parseNumber(row[base + 8]),
    hsr_distance: parseNumber(row[base + 9]),
    hsr_custom: parseNumber(row[base + 10]),
    sprint_distance: parseNumber(row[base + 11]),
    sprint_custom: parseNumber(row[base + 12]),
    sprint_count: parseNumber(row[base + 13]),
    sprint_count_custom: parseNumber(row[base + 14]),
    acc_count: parseNumber(row[base + 15]),
    dec_count: parseNumber(row[base + 16]),
    acd_load: parseNumber(row[base + 17]),
    max_speed: parseNumber(row[base + 18]),
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

// "159cm,40kg" / "156cm 41kg" / "169cm59kg" / "177.8 70kg" / "170kg.59kg"(오타) 등
// 자유 형식으로 입력된 셀에서 키(cm)·몸무게(kg)를 추출한다.
function parseHeightWeightFreeText(raw: string): { height: number | null; weight: number | null } {
  if (!raw) return { height: null, weight: null };
  const kgMatches = [...raw.matchAll(/(\d+\.?\d*)\s*kg/gi)];
  const weight = kgMatches.length > 0 ? parseFloat(kgMatches[kgMatches.length - 1][1]) : null;
  const cmMatches = [...raw.matchAll(/(\d+\.?\d*)\s*cm/gi)];
  let height = cmMatches.length > 0 ? parseFloat(cmMatches[0][1]) : null;
  if (height == null) {
    const allNums = [...raw.matchAll(/\d+\.?\d*/g)].map(m => parseFloat(m[0]));
    if (allNums.length >= 2) height = allNums[0];
  }
  return { height: height != null && !isNaN(height) ? height : null, weight: weight != null && !isNaN(weight) ? weight : null };
}

export interface BodySheetMonthEntry {
  month: number;
  height: number | null;
  weight: number | null;
}
export interface BodySheetRow {
  timestamp: string;
  player_name: string;
  entries: BodySheetMonthEntry[];
}

// 구글 시트(월별 신장/체중 자동 기록): 타임스탬프,이름,1월,2월,3월,... — 열이 늘어날 때마다 새 월이 추가됨
export function parseBodySheetCsv(csvText: string): BodySheetRow[] {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data;
  if (rows.length < 2) return [];

  const header = rows[0];
  const monthCols: { index: number; month: number }[] = [];
  for (let i = 2; i < header.length; i++) {
    const m = header[i]?.match(/(\d+)월/);
    if (m) monthCols.push({ index: i, month: parseInt(m[1]) });
  }

  return rows.slice(1).map(row => ({
    timestamp: row[0] || '',
    player_name: row[1] || '',
    entries: monthCols.map(({ index, month }) => ({ month, ...parseHeightWeightFreeText(row[index] || '') })),
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
