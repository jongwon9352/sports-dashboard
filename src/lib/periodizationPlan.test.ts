// 주간 주기화 초안 생성기의 회귀 보호.
//
// 세 가지를 고정한다.
//   R8 — 표본이 적은 MD 코드가 강도 100% 기준점을 빼앗지 못한다.
//   C2 — MD-5 가 휴식으로 떨어지지 않는다(MD_META 에 자리가 있다).
//   X3 — 경기 직후 1~2일은 역산 라벨이 MD-3 이어도 고강도로 처방되지 않는다.

import { describe, it, expect } from 'bun:test';
import { buildWeeklyPlan } from './periodizationPlan';
import type { MdProfileRow } from './api';

/** 실측 프로파일 한 줄 만들기 — 값은 2026-11-05 재집계값에 맞췄다 */
function row(code: string, rpe: number, n: number, td = 6000): MdProfileRow {
  return { code, n, td, hsr: 150, sprint: 20, load: Math.round(rpe * 70), acc: 20, dec: 20, rpe };
}

/** 2026-05-23·24 가 공식 경기(소년체전 2연전)인 주. 5/18(월)~5/24(일) */
const TAPER_WEEK = { weekStart: '2026-05-18', matchDates: ['2026-05-23', '2026-05-24'] };

const PROFILE: MdProfileRow[] = [
  row('MD-5', 5.91, 16, 6403),
  row('MD-4', 7.22, 23, 7140),
  row('MD-3', 7.82, 24, 7128),
  row('MD-2', 6.34, 28, 6987),
  row('MD-1', 5.57, 33, 5584),
  row('MD', 8.03, 10, 5932),
];

describe('C2 — MD-5 가 주간 초안에서 휴식으로 떨어지지 않는다', () => {
  it('MD-5 자리에 성격·시간·수치가 채워진다', () => {
    const { days } = buildWeeklyPlan({ ...TAPER_WEEK, mdProfile: PROFILE, topic: 'Tapering' });
    const md5 = days[0]; // 5/18 = MD-5
    expect(md5.periodization).toBe('MD-5');
    expect(md5.perio_code).not.toBe('REST');
    expect(md5.physical_goal).not.toBe('휴식');
    expect(md5.time).not.toBe('');
    expect(Number(md5.total_distance)).toBeGreaterThan(0);
  });
});

describe('R8 — 표본이 적은 코드는 강도 기준점이 되지 못한다', () => {
  // MD+1 이 하루치(n=1)이고 RPE 8.30 이면, 가드가 없으면 그것이 100% 기준점이 되어
  // MD-3(7.82)이 94% 로 내려앉는다. 가드가 있으면 기준점은 MD-3 이고 100% 가 유지된다.
  const withThinPeak = [...PROFILE, row('MD+1', 8.30, 1)];

  it('하루치 MD+1 이 있어도 MD-3 이 100% 다', () => {
    const { days } = buildWeeklyPlan({
      ...TAPER_WEEK, mdProfile: withThinPeak, topic: 'Tapering',
    });
    const md3 = days[2]; // 5/20 = MD-3
    // Tapering 의 intensity 배율은 1.00 이므로 기준점이 MD-3 이면 정확히 100% 다.
    expect(md3.intensity).toBe('100%');
  });

  it('표본 10일 미만 코드만 있으면 표준 템플릿 값으로 폴백한다', () => {
    const allThin = PROFILE.map(r => ({ ...r, n: 3 }));
    const { days } = buildWeeklyPlan({ ...TAPER_WEEK, mdProfile: allThin, topic: 'Tapering' });
    // 기준점이 없으면 basePct = meta.intensityPct 다. MD-3 의 템플릿 값은 90%.
    expect(days[2].intensity).toBe('90%');
  });
});

describe('X3 — 경기 직후 1~2일은 고강도로 처방되지 않는다', () => {
  // 공식 경기 간격 4일: 4/1 과 4/5. 그 사이 4/2·4/3·4/4 가 훈련일이고
  // 역산으로는 4/2=MD-3, 4/3=MD-2, 4/4=MD-1 이다.
  // 4/2 는 경기 다음날이므로 역산 라벨이 MD-3 이어도 회복으로 처방해야 한다.
  const SHORT_GAP = { weekStart: '2026-03-30', matchDates: ['2026-04-01', '2026-04-05'] };
  const profile = [...PROFILE, row('MD+1', 6.5, 12, 3000), row('MD+2', 5.8, 15, 3200)];

  it('경기 다음날은 이중 라벨로 표시되고 회복으로 처방된다', () => {
    const { days } = buildWeeklyPlan({ ...SHORT_GAP, mdProfile: profile, topic: 'Aerobic' });
    const dayAfter = days[3]; // 3/30 월 기준 4번째 = 4/2
    expect(dayAfter.periodization).toBe('MD+1/-3');
    expect(dayAfter.perio_code).toBe('RECOVERY');
  });

  it('회복으로 돌린 날의 목표 수치가 MD-3 의 고부하가 아니다', () => {
    const { days } = buildWeeklyPlan({ ...SHORT_GAP, mdProfile: profile, topic: 'Aerobic' });
    const dayAfter = days[3];
    // MD+1 실측(3,000m)에서 가져와야 한다. MD-3 실측은 7,128m 다.
    expect(Number(dayAfter.total_distance)).toBeLessThan(5000);
  });

  it('경기 사흘 뒤는 가드에 걸리지 않는다', () => {
    const { days } = buildWeeklyPlan({ ...SHORT_GAP, mdProfile: profile, topic: 'Aerobic' });
    const d = days[5]; // 4/4 = MD-1, sincePrev=3
    expect(d.periodization).toBe('MD-1');
  });
});
