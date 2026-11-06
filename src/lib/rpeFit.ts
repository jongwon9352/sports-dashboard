// 「그 날 강도에 맞는 양」 — MD 별 기준 강도에 도달한 부하 범위를 성숙도 구간마다 낸다.
//
// **목표값을 새로 만들지 않는다.** 이 과제는 한 번 「적정 RPE 띠」를 들고 있다가 버렸다
// (달성률). 여기서 쓰는 기준은 우리가 정한 숫자가 아니라 **팀이 그 요일에 실제로 낸 평균
// RPE** 다. 그래서 이 함수가 답하는 질문은 이것이다 —
//
//   「MD-3 이 팀 전체에서 평균 8.1 로 나온 날이라면, 각 성숙도 구간은 그 8.1 을 내기 위해
//     얼마를 뛰었나?」
//
// 기준이 데이터에서 나오므로 처방이 아니라 기술이다. 「이만큼 줘야 한다」가 아니라
// 「이만큼일 때 그 날의 강도가 나왔다」로만 읽어야 한다.

import { MATURITY_BANDS, type MaturityBandKey } from './maturity';
import { MD_COLUMNS, type LoadAxisKey, type RpeScaleResult } from './rpeScale';

/** 기준 RPE 와 같다고 볼 폭. ±0.5 보다 좁히면 맞는 구간이 거의 사라진다. */
export const FIT_TOLERANCE = 0.5;

const round1 = (v: number) => Math.round(v * 10) / 10;

export interface FitCell {
  band: MaturityBandKey;
  /**
   * 그 구간이 기준 강도를 낸 부하 범위. 맞는 구간이 없으면 null.
   *
   * **구간 경계가 아니라 그 구간들의 실제 부하 중앙값(`ResponseBin.x`)이다.** 경계를 쓰면
   * 양 끝 구간이 범위를 집어삼킨다 — 마지막 구간의 hi 는 관측 최대값(18,890m)이고 첫
   * 구간의 lo 는 0 이라, 맞는 구간 셋만 걸려도 「4,463~18,890」 같은 14km 폭이 나왔다.
   * 중앙값을 쓰면 「그 강도가 나온 세션들이 실제로 어디에 모여 있었나」가 된다.
   */
  lo: number | null;
  hi: number | null;
  /** 그 범위에 들어간 세션 */
  n: number;
  /** 가장 가까운 구간의 평균 RPE — 범위를 못 찾았을 때 왜 못 찾았는지 보여준다 */
  nearestRpe: number | null;
  /** 그 구간이 실제로 소화한 양의 중앙 50% — 「맞는 양」과 대조하는 값 */
  actualP25: number | null;
  actualP75: number | null;
  /** 실제 양이 맞는 범위보다 위/아래/안쪽인지. 범위를 못 찾았으면 null */
  verdict: 'below' | 'within' | 'above' | null;
}

export interface FitRow {
  md: string;
  /** 그 요일에 팀 전체가 낸 평균 RPE — 기준값 */
  referenceRpe: number | null;
  cells: FitCell[];
}

export interface RpeFit {
  axis: LoadAxisKey;
  rows: FitRow[];
  /** 범위를 찾은 칸 수 / 전체 칸 수 — 해석의 신뢰도 */
  matched: number;
  cells: number;
}

/**
 * 성숙도 구간별로 「그 요일의 기준 강도를 낸 부하 범위」를 낸다.
 *
 * 기준 RPE 는 그 MD 의 **세션 가중 평균**이다. 구간별 평균을 단순 평균하면 45세션짜리
 * PHV+2년~ 칸이 233세션짜리 Pre-PHV 칸과 같은 무게를 갖는다.
 */
export function buildRpeFit(scale: RpeScaleResult, axis: LoadAxisKey): RpeFit {
  const rows: FitRow[] = [];
  let matched = 0;
  let cells = 0;

  for (const md of MD_COLUMNS) {
    const gridCells = scale.grid.filter(c => c.md === md && c.rpeMean != null && c.withRpe > 0);
    const weight = gridCells.reduce((s, c) => s + c.withRpe, 0);
    const referenceRpe = weight > 0
      ? round1(gridCells.reduce((s, c) => s + c.rpeMean! * c.withRpe, 0) / weight)
      : null;

    const fitCells: FitCell[] = MATURITY_BANDS.map(b => {
      const grid = scale.grid.find(c => c.md === md && c.band === b.key);
      const actualP25 = grid?.axes[axis].p25 ?? null;
      const actualP75 = grid?.axes[axis].p75 ?? null;

      // **축으로도 걸러야 한다.** scale.response 는 네 지표 행을 모두 담고 있어서
      // md·band 만으로 찾으면 언제나 첫 축(td)이 걸린다 — 지표 탭을 바꿔도 범위가
      // td 값 그대로 나오고, 실제 소화량만 바뀌어 ↓ 가 전부 켜졌다.
      const bins = (scale.response.find(r => r.md === md && r.band === b.key && r.axis === axis)?.bins ?? [])
        .filter(x => x.rpeMean != null);

      if (referenceRpe == null || bins.length === 0) {
        return { band: b.key, lo: null, hi: null, n: 0, nearestRpe: null, actualP25, actualP75, verdict: null };
      }

      const inTol = bins.filter(x => Math.abs(x.rpeMean! - referenceRpe) <= FIT_TOLERANCE);
      const nearest = bins.reduce((best, x) =>
        Math.abs(x.rpeMean! - referenceRpe) < Math.abs(best.rpeMean! - referenceRpe) ? x : best);

      if (inTol.length === 0) {
        return {
          band: b.key, lo: null, hi: null, n: 0,
          nearestRpe: round1(nearest.rpeMean!), actualP25, actualP75, verdict: null,
        };
      }

      cells++;
      matched++;
      const lo = Math.min(...inTol.map(x => x.x));
      const hi = Math.max(...inTol.map(x => x.x));
      const mid = actualP25 != null && actualP75 != null ? (actualP25 + actualP75) / 2 : null;
      const verdict = mid == null ? null : mid < lo ? 'below' : mid > hi ? 'above' : 'within';

      return {
        band: b.key, lo, hi,
        n: inTol.reduce((s, x) => s + x.n, 0),
        nearestRpe: round1(nearest.rpeMean!),
        actualP25, actualP75, verdict,
      };
    });

    // 범위를 못 찾은 칸도 분모에 넣는다 — 못 찾은 것을 숨기면 신뢰도가 과장된다.
    cells += fitCells.filter(c => c.lo == null).length;
    rows.push({ md, referenceRpe, cells: fitCells });
  }

  return { axis, rows, matched, cells };
}
