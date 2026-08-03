// 경기 일정에서 MD 코드를 계산해 차주 주간 주기화 초안을 만든다.
// 규칙 기반 로직이다 — LLM을 부르지 않는다.
//
// 요일 고정이 아니라 경기 일정에서 MD 코드를 계산해 배치한다. 실제 일정에는 3·4·5·7일
// 간격과 대회 연속 경기가 섞여 있어 "토요일=MD" 같은 하드코딩이 통하지 않는다.
//
// 목표 수치는 우리 팀의 MD별 실측 평균(api.fetchTeamMdProfile)에서만 가져온다.
// 남의 팀 주기화표 숫자를 베끼지 않고, 실측이 없는 MD 코드는 비워 둔다.

import { emptyDayPlan, type DayPlan, type MdProfileRow } from './api';
import { mdCodeForDays, toMatchDays } from './mdCode';

type Focus = 'match' | 'volume' | 'intensity' | 'tactical' | 'activation' | 'recovery' | 'rest';

interface MdMeta {
  focus: Focus;
  /** 캘린더·주기화표가 공유하는 강도 라벨 */
  key: string;
  intensityPct: number;
  minutes: string;
}

// MD 코드별 성격. 배치는 경기 간격이 정하고(mdCode.ts), 이 표는 "그 자리에서 뭘 하나"만 정한다.
const MD_META: Record<string, MdMeta> = {
  'MD': { focus: 'match', key: 'MATCH', intensityPct: 100, minutes: '90' },
  'MD-1': { focus: 'activation', key: 'REACTION', intensityPct: 55, minutes: '45' },
  'MD-2': { focus: 'tactical', key: 'SPEED', intensityPct: 70, minutes: '75' },
  'MD-3': { focus: 'intensity', key: 'ENDURANCE (TD/VHIR)', intensityPct: 90, minutes: '75' },
  'MD-4': { focus: 'volume', key: 'STRENGTH (ACC/SPRINT)', intensityPct: 75, minutes: '75' },
  'MD+1': { focus: 'recovery', key: 'RECOVERY', intensityPct: 25, minutes: '30' },
  'MD+2': { focus: 'recovery', key: 'RECOVERY', intensityPct: 35, minutes: '40' },
};
// 주기화 구간 밖(다음 경기까지 5일 이상) — 휴식으로 둔다.
const REST_META: MdMeta = { focus: 'rest', key: 'REST', intensityPct: 0, minutes: '' };

/** MD 코드 → 강도 라벨. 월간 캘린더와 주기화표가 같은 분류를 쓰도록 여기서 한 번만 정의한다. */
export function mdIntensityKey(code: string | null): string {
  if (!code) return 'REST';
  return (MD_META[code] ?? REST_META).key;
}

export const INTENSITY_STYLE: Record<string, { bg: string; color: string }> = {
  'MATCH': { bg: 'var(--color-purple)', color: '#FFFFFF' },
  'REST': { bg: '#F7E4E4', color: '#8A5A5A' },
  'RECOVERY': { bg: '#C6E0B4', color: '#375623' },
  'REACTION': { bg: '#BDD7EE', color: '#1F4E79' },
  'SPEED': { bg: '#BDD7EE', color: '#1F4E79' },
  'STRENGTH (ACC/SPRINT)': { bg: '#F8CBAD', color: '#833C0C' },
  'ENDURANCE (TD/VHIR)': { bg: '#FFE699', color: '#7F6000' },
};

// ── 주간 에너지 시스템 토픽 ─────────────────────────────────────────────
// 6주 블록 주기화(Issurin: Accumulation → Transmutation → Realization)를 우리 팀이 쓰는
// 에너지 대사 구분에 맞춘 것이다. 볼륨은 단조 감소하고 강도는 올라간다.
//   Aerobic   = Accumulation      볼륨↑ 강도↓ (일반적 유산소 베이스)
//   Anaerobic = Transmutation 전반 볼륨 −23% · 강도↑
//   Mixed     = Transmutation 후반 볼륨 누적 −35% · 강도 최고 (문헌의 "볼륨 30~40% 감소"와 일치)
//   Tapering  = Realization/Taper  볼륨 −55% · 강도는 유지 (테이퍼의 핵심 원칙)
export const ENERGY_TOPICS = ['Aerobic', 'Anaerobic', 'Mixed', 'Tapering'] as const;
export type EnergyTopic = (typeof ENERGY_TOPICS)[number];

interface TopicScale {
  volume: number;
  intensity: number;
  note: string;
}

export const TOPIC_SCALE: Record<EnergyTopic, TopicScale> = {
  'Aerobic': { volume: 1.10, intensity: 0.88, note: '유산소 베이스 축적 — 볼륨 확대, 강도 절제' },
  'Anaerobic': { volume: 0.85, intensity: 1.08, note: '무산소 전환 — 볼륨 축소, 고강도 비중 확대' },
  'Mixed': { volume: 0.72, intensity: 1.15, note: '복합 — 볼륨 최소화, 경기 특이 고강도 집중' },
  'Tapering': { volume: 0.50, intensity: 1.00, note: '테이퍼링 — 볼륨만 줄이고 강도는 유지' },
};

function physicalGoalFor(focus: Focus, topic: EnergyTopic): string {
  if (focus === 'match') return '경기 (Match Day)';
  if (focus === 'rest') return '휴식';
  if (focus === 'recovery') return '회복 + 능동적 이완';
  if (focus === 'activation') return '활성화 + 세트피스 점검';
  if (focus === 'tactical') {
    return topic === 'Tapering' ? '전술 훈련 (볼륨 축소)' : '전술 훈련 + 볼 점유';
  }
  if (focus === 'volume') {
    if (topic === 'Aerobic') return '유산소 베이스 + 볼륨 훈련';
    if (topic === 'Tapering') return '팀 전술 훈련 (저볼륨)';
    return '팀 전술 훈련 + 근력(ACC/스프린트)';
  }
  // focus === 'intensity'
  if (topic === 'Aerobic') return '유산소 인터벌 + 세트피스';
  if (topic === 'Anaerobic' || topic === 'Mixed') return '고강도 인터벌(무산소) + 세트피스';
  return '고강도 유지 인터벌 (짧게)';
}

function warmupFor(focus: Focus): string {
  if (focus === 'match') return 'FIFA 11+ 스타일 워밍업';
  if (focus === 'rest') return '';
  return '동적 스트레칭 + 활성화 루틴';
}

function prepFor(focus: Focus): string {
  if (focus === 'rest') return '';
  if (focus === 'activation') return '세트피스 리허설 + 상대 분석';
  return '팀 미팅 + 컨디션 체크';
}

/** weekStart(월요일)부터 7일치 날짜. 시간대 영향을 받지 않게 UTC 산술로 만든다. */
function weekDates(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: 7 }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}

export interface WeeklyPlanInputs {
  /** 계획을 세울 주의 월요일 (YYYY-MM-DD) */
  weekStart: string;
  /** 과거 + 예정 경기일 (api.fetchAllMatchDates) */
  matchDates: string[];
  /** 팀의 MD별 실측 프로파일. 목표 수치의 유일한 근거다. */
  mdProfile: MdProfileRow[];
  topic: EnergyTopic;
}

export function buildWeeklyPlan(inputs: WeeklyPlanInputs): { weekTopic: string; days: DayPlan[] } {
  const scale = TOPIC_SCALE[inputs.topic];
  const matchDays = toMatchDays(inputs.matchDates);
  const dates = weekDates(inputs.weekStart);
  let measuredCount = 0;

  const days: DayPlan[] = dates.map(date => {
    const code = mdCodeForDays(date, matchDays).code;
    const meta = code ? MD_META[code] ?? REST_META : REST_META;
    const day = emptyDayPlan();

    day.periodization = code ?? '휴식';
    day.perio_code = meta.key;
    day.physical_goal = physicalGoalFor(meta.focus, inputs.topic);
    day.warmup = warmupFor(meta.focus);
    day.prep = prepFor(meta.focus);
    if (meta.focus === 'rest') return day;

    day.time = meta.minutes;
    // 경기는 강도 조절 대상이 아니다 — 토픽 배율을 적용하지 않는다.
    const intensity = meta.focus === 'match'
      ? meta.intensityPct
      : Math.min(100, Math.round(meta.intensityPct * scale.intensity));
    day.intensity = `${intensity}%`;

    const measured = inputs.mdProfile.find(r => r.code === code);
    if (!measured) return day; // 실측 없는 코드는 수치를 지어내지 않고 비워 둔다

    measuredCount++;
    // 경기일 목표는 실측 그대로 — 경기 요구량은 주간 토픽으로 줄이는 대상이 아니다.
    const v = meta.focus === 'match' ? 1 : scale.volume;
    day.total_distance = Math.round(measured.td * v).toString();
    day.hsr_distance = Math.round(measured.hsr * v).toString();
    day.sprint_distance = Math.round(measured.sprint * v).toString();
    day.training_load = Math.round(measured.load * v).toString();
    day.acc_dec = `${Math.round(measured.acc * v)} / ${Math.round(measured.dec * v)}`;
    return day;
  });

  const matchCount = days.filter(d => d.periodization === 'MD').length;
  const matchNote = matchCount === 0 ? ' · 경기 없음' : matchCount > 1 ? ` · 경기 ${matchCount}회` : ' · 경기 1회';
  const basisNote = measuredCount > 0 ? ` · MD별 팀 실측 ${measuredCount}일 반영` : ' · 실측 데이터 없음(수치 미기입)';

  return { weekTopic: `${inputs.topic} — ${scale.note}${matchNote}${basisNote}`, days };
}
