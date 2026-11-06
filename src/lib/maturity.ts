// 생리학적 성숙도(PHV 경과 연수) 판정. 선수 도메인 지식만 두고 집계는 모른다(rpeScale.ts).
//
// `maturity_offset` 의 **정본은 `player_phv_khamis_roche.mirwald_maturity_offset` 뷰다**
// (2026-11-06 사용자 결정). `players.maturity_offset` 컬럼에도 값이 있지만 갱신하는 코드가
// 없고 같은 선수를 두 구간까지 다르게 분류한다 — 집계에 그 컬럼을 쓰지 않는다.
//
// 이 저장소에는 성숙도 체계가 둘 있고 **출처가 다르다**. 섞으면 같은 선수가 두 이름을 갖는다.
//   3단 `players.maturity_status` (Pre/Mid/Post) — 저장 컬럼. 배지(MaturityBadge)로 표시한다.
//   4단 이 파일 — `maturity_offset` 과 세션 날짜로 매번 계산한다. **평문으로 표시한다**(배지 아님).
// 형태 차이(알약 배지 vs 그냥 글자)가 두 체계를 구분한다.
//
// 측정이 한 번뿐이라는 한계가 있다. `maturity_offset`(Mirwald 성숙 오프셋)은 측정일 기준이고,
// 다른 날짜의 값은 달력을 밀어 추정한 것이다. 실측 최대 외삽은 0.50년이고 70%가 3개월 이내지만,
// 구간 경계(0·1·2년) ±0.15년에 전체의 16%가 걸쳐 있다 — 화면에 측정일을 밝혀야 한다.

import { toDayNumber } from './mdCode';

/** Mirwald 공식의 유효 범위를 벗어나는 나이. 이 이상은 성숙도를 판정하지 않는다. */
const MAX_AGE_YEARS = 18;
const DAYS_PER_YEAR = 365.25;

export type MaturityBandKey = 'pre' | 'y01' | 'y12' | 'y2p';

export interface MaturityBand {
  key: MaturityBandKey;
  /** 평문 라벨 (D25 — 배지 모양을 쓰지 않는다) */
  label: string;
  /** PHV 경과 연수 구간 [lo, hi) */
  lo: number;
  hi: number;
  /** 차트 마크 색 토큰. **글자에는 쓰지 않는다** — 가장 밝은 단이 본문 대비 3.44:1 로 AA 미달이다. */
  colorVar: string;
  /** 같은 색조 4선이 교차할 때를 위한 중복 인코딩 (Recharts strokeDasharray) */
  dash: string | undefined;
}

/**
 * 성숙도 4구간. 서열 척도이므로 단일 색조 명도 램프를 쓴다(범주형 색상환이 아니다).
 * **이 목록이 라벨·구간·색·선모양의 유일한 출처다.** 어느 하나를 다른 곳에 복사하지 않는다.
 */
export const MATURITY_BANDS: readonly MaturityBand[] = [
  { key: 'pre', label: 'Pre-PHV', lo: -Infinity, hi: 0, colorVar: '--color-phv-pre', dash: undefined },
  { key: 'y01', label: 'PHV+0~1년', lo: 0, hi: 1, colorVar: '--color-phv-y01', dash: '4 2' },
  { key: 'y12', label: 'PHV+1~2년', lo: 1, hi: 2, colorVar: '--color-phv-y12', dash: '2 2' },
  { key: 'y2p', label: 'PHV+2년~', lo: 2, hi: Infinity, colorVar: '--color-phv-y2p', dash: '6 2 2 2' },
] as const;

/** 선수의 성숙도 판정에 필요한 최소 입력. DB 가 전부 nullable 이므로 타입도 그렇게 둔다. */
export interface MaturityInput {
  maturity_offset: number | null;
  baseline_measured_at: string | null;
  birth_date: string | null;
}

/** 두 날짜 사이의 연수. 시간대·서머타임을 배제하려고 UTC 일 번호로 계산한다. */
function yearsBetween(fromIso: string, toIso: string): number {
  return (toDayNumber(toIso) - toDayNumber(fromIso)) / DAYS_PER_YEAR;
}

/**
 * 세션 날짜 기준 PHV 경과 연수.
 * 측정일의 오프셋에 측정일부터 세션까지의 경과 연수를 더한다. 음수면 PHV 이전이다.
 */
export function yearsFromPhv(maturityOffset: number, measuredAt: string, sessionDate: string): number {
  return maturityOffset + yearsBetween(measuredAt, sessionDate);
}

/** 세션 날짜의 나이(연). 생일이 지났는지까지 반영된다. */
export function ageAt(birthDate: string, sessionDate: string): number {
  return yearsBetween(birthDate, sessionDate);
}

/**
 * 세션 날짜 기준 성숙도 구간. 판정할 수 없으면 null 이다 — 추정값을 지어내지 않는다.
 *
 * null 이 되는 경우: 성숙도 측정이 없다 / 측정일이 없다 / 생년월일이 없다 / 18세 이상이다.
 * 호출부는 null 을 0 이나 'pre' 로 취급하면 안 된다. 제외 내역에 세어 화면에 밝힌다.
 */
export function maturityBandFor(p: MaturityInput, sessionDate: string): MaturityBandKey | null {
  if (p.maturity_offset == null || p.baseline_measured_at == null || p.birth_date == null) return null;
  if (ageAt(p.birth_date, sessionDate) >= MAX_AGE_YEARS) return null;

  const yfp = yearsFromPhv(p.maturity_offset, p.baseline_measured_at, sessionDate);
  if (!Number.isFinite(yfp)) return null;
  return bandForYears(yfp);
}

/** PHV 경과 연수 → 구간. 경계값은 위쪽 구간에 속한다(0 → y01, 1 → y12, 2 → y2p). */
export function bandForYears(yearsFromPhvValue: number): MaturityBandKey {
  const hit = MATURITY_BANDS.find(b => yearsFromPhvValue >= b.lo && yearsFromPhvValue < b.hi);
  // lo/hi 가 ±Infinity 로 전 구간을 덮으므로 여기에 도달하지 않는다. 타입을 좁히기 위한 폴백이다.
  return (hit ?? MATURITY_BANDS[0]).key;
}

export function band(key: MaturityBandKey): MaturityBand {
  const hit = MATURITY_BANDS.find(b => b.key === key);
  if (!hit) throw new Error(`알 수 없는 성숙도 구간: ${key}`);
  return hit;
}

/** 평문 라벨 (D25). 배지로 감싸지 않는다 — 3단 배지와 형태로 구분된다. */
export function bandLabel(key: MaturityBandKey): string {
  return band(key).label;
}

/**
 * 구간 경계에 얼마나 가까운가. 측정이 한 번뿐이라 경계 근처는 오차로 구간이 뒤집힌다.
 * 화면이 「경계 근접 n건」을 밝히는 데 쓴다(R6).
 */
export function isNearBandBoundary(yearsFromPhvValue: number, margin = 0.15): boolean {
  return MATURITY_BANDS.some(b =>
    Number.isFinite(b.lo) && Math.abs(yearsFromPhvValue - b.lo) < margin);
}
