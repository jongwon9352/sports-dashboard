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
  // MD-5 는 mdCode 의 MAX_BACKWARD 가 5로 올라가며 처음 생긴 자리다. 성격의 출처는 주기화표다 —
  // Physical Goal 이 Recovery/Stability 이고 Time 은 70' 로 일정하다. 실측도 가장 낮은 축이다
  // (RPE 5.91 · TD 6,403 — MD-1 다음으로 낮다).
  // intensityPct 40 은 폴백일 뿐이다: 주기화표의 MD-5 Intensity 는 주차 성격에 따라 30~100% 를
  // 오가므로 단일 계획값이 없고, 실측이 있으면 아래 basePct 가 그것을 쓴다.
  'MD-5': { focus: 'recovery', key: 'RECOVERY', intensityPct: 40, minutes: '70' },
  'MD+1': { focus: 'recovery', key: 'RECOVERY', intensityPct: 25, minutes: '30' },
  'MD+2': { focus: 'recovery', key: 'RECOVERY', intensityPct: 35, minutes: '40' },
};
// 주기화 구간 밖(다음 경기까지 6일 이상) — 휴식으로 둔다.
const REST_META: MdMeta = { focus: 'rest', key: 'REST', intensityPct: 0, minutes: '' };
/** 경기 직후 며칠까지는 역산 라벨이 무엇이든 회복으로 처방하는가 */
const RECOVERY_DAYS_AFTER_MATCH = 2;
/**
 * MD별 실측을 쓰기 위한 최소 표본 일수.
 * 기준점(peakTrainingRpe)과 목표 수치(measured) 둘 다에 적용한다. 기준점만 막으면
 * 하루치 코드가 자기 목표 수치로 「경기 다음날이 주중 가장 힘든 날」을 말하게 된다
 * (프로덕션 실측: MD+1 n=1 · RPE 8.30 · TD 7,572 → 초안에 93% · 8,329 로 찍혔다).
 * 미달이면 수치를 비워 둔다 — 아래 `if (!measured) return day` 의 기존 원칙과 같다.
 */
const MIN_PROFILE_SAMPLE_DAYS = 10;

/** MD 코드 → 강도 라벨. 월간 캘린더와 주기화표가 같은 분류를 쓰도록 여기서 한 번만 정의한다. */
export function mdIntensityKey(code: string | null): string {
  if (!code) return 'REST';
  return (MD_META[code] ?? REST_META).key;
}

export const INTENSITY_STYLE: Record<string, { bg: string; color: string }> = {
  'MATCH': { bg: 'var(--color-brand)', color: '#FFFFFF' },
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

/**
 * 월간 캘린더에서 쓰는 토픽 무관 기본 제안 문구. 주간 토픽(Aerobic 등)을 아직 고르지
 * 않은 미래 날짜에도, 경기 일정만으로 계산된 MD 코드에서 바로 방향을 보여준다.
 */
export function defaultGoalForCode(code: string | null): string {
  const meta = code ? MD_META[code] ?? REST_META : REST_META;
  if (meta.focus === 'rest') return '휴식';
  if (meta.focus === 'match') return '경기 (Match Day)';
  if (meta.focus === 'recovery') return '회복 + 능동적 이완';
  if (meta.focus === 'activation') return '활성화 + 세트피스 점검';
  if (meta.focus === 'tactical') return '전술 훈련 + 볼 점유';
  if (meta.focus === 'volume') return '팀 전술 훈련 + 볼륨 훈련';
  return '고강도 인터벌 + 세트피스'; // intensity
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

  // 강도(%)의 기준을 표준 템플릿이 아니라 우리 팀이 실제 기록한 RPE로 바꾼다.
  // 경기일 RPE는 훈련 강도 기준으로 쓸 수 없으므로(경기는 항상 최고 강도) 제외하고,
  // 훈련일 중 우리 팀이 가장 힘들게 뛴 MD 코드를 100% 기준점으로 삼는다.
  //
  // 표본 가드가 필요하다. Math.max 는 표본 수를 보지 않으므로, 하루치만 쌓인 코드가
  // 기준점을 빼앗아 다른 모든 날의 강도를 끌어내릴 수 있다. MD 정의가 공식 경기 앵커로
  // 바뀐 뒤 MD+1 이 1일치로 줄면서 실제로 그렇게 될 수 있었다(실측 RPE 8.30).
  const peakTrainingRpe = Math.max(
    0,
    ...inputs.mdProfile
      .filter(r => r.code !== 'MD' && r.rpe > 0 && r.n >= MIN_PROFILE_SAMPLE_DAYS)
      .map(r => r.rpe),
  ) || null;

  const days: DayPlan[] = dates.map(date => {
    const label = mdCodeForDays(date, matchDays);
    const code = label.code;
    // 경기 직후 1~2일은 역산 라벨이 무엇이든 회복으로 처방한다.
    // 공식 경기 간격이 4일이면 경기 다음날이 역산으로 MD-3 이 되는데, MD-3 은 고강도 지구력이다.
    // 주기화표가 그 날을 「MD+1/-3」 이중 라벨로 적어 둔 이유가 이것이다 — 일정 분류가 훈련 처방을
    // 이기면 안 된다. 라벨은 역산 쪽을 그대로 표시하고(집계와 일치), 처방만 회복으로 돌린다.
    const since = label.daysSincePrevMatch;
    const inRecovery = code != null && code.startsWith('MD-')
      && since != null && since >= 1 && since <= RECOVERY_DAYS_AFTER_MATCH;
    const prescribed = inRecovery ? `MD+${since}` : code;
    const meta = prescribed ? MD_META[prescribed] ?? REST_META : REST_META;
    const day = emptyDayPlan();
    // 수치도 처방 코드에서 가져온다. 역산 코드로 가져오면 처방은 회복인데 목표 TD·HSR 은
    // MD-3 의 고부하가 들어가 가드가 무의미해진다.
    const measured = prescribed
      ? inputs.mdProfile.find(r => r.code === prescribed && r.n >= MIN_PROFILE_SAMPLE_DAYS)
      : undefined;

    // 표시는 역산 라벨이다. 회복으로 돌린 날은 주기화표처럼 이중으로 적는다.
    day.periodization = inRecovery ? `MD+${since}/${code!.slice(2)}` : code ?? '휴식';
    day.perio_code = meta.key;
    day.physical_goal = physicalGoalFor(meta.focus, inputs.topic);
    day.warmup = warmupFor(meta.focus);
    day.prep = prepFor(meta.focus);
    if (meta.focus === 'rest') return day;

    day.time = meta.minutes;
    // 경기는 강도 조절 대상이 아니다 — 토픽 배율을 적용하지 않는다.
    // 훈련일은 실측 RPE가 있으면 그 상대 강도(%)를, 없으면 표준 템플릿 값을 기준으로 삼는다.
    const basePct = (measured && measured.rpe > 0 && peakTrainingRpe)
      ? Math.round((measured.rpe / peakTrainingRpe) * 100)
      : meta.intensityPct;
    const intensity = meta.focus === 'match' ? meta.intensityPct : Math.min(100, Math.round(basePct * scale.intensity));
    day.intensity = `${intensity}%`;

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
  const basisNote = measuredCount > 0
    ? ` · MD별 팀 실측 ${measuredCount}일 반영${peakTrainingRpe ? ' (강도도 실측 RPE 기준)' : ''}`
    : ' · 실측 데이터 없음(수치 미기입)';

  return { weekTopic: `${inputs.topic} — ${scale.note}${matchNote}${basisNote}`, days };
}
