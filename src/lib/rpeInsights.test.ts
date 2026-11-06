// 분석 문장의 근거가 되는 수치의 회귀 보호.
//
// 이 모듈은 화면에 **주장**을 띄운다. 「성숙할수록 힘들어한다」처럼 방향을 말하려면
// 그 방향이 실제로 유지되는지 세야 한다. 세는 법이 틀리면 화면이 틀린 말을 한다.

import { describe, it, expect } from 'bun:test';
import { buildRpeScale, type PoolRow, type PlayerMaturity } from './rpeScale';
import { buildRpeInsights } from './rpeInsights';

const ANCHORS = ['2026-06-06', '2026-06-13'];
const MD5 = '2026-06-01';

function player(id: string, offset: number): PlayerMaturity {
  return { id, maturity_offset: offset, baseline_measured_at: '2026-07-02', birth_date: '2013-02-13' };
}
function row(p: string, rpe: number, td: number): PoolRow {
  return { player_id: p, date: MD5, rpe, td, hsr: 150, sprint: 20, action: 40, group_type: 'U15', source: 'training' };
}

/** 한 성숙도 구간에 부하가 오르면 RPE 가 slope 만큼 오르는 집단을 만든다 */
function band(prefix: string, offset: number, base: number, slope: number, n = 160): PoolRow[] {
  return Array.from({ length: n }, (_, i) => {
    const td = 3000 + (i % 40) * 150;
    return row(`${prefix}${i % 4}`, base + ((td - 3000) / 1000) * slope, td);
  });
}
const players = (prefix: string, offset: number) =>
  Array.from({ length: 4 }, (_, i) => player(`${prefix}${i}`, offset));

describe('부하 효과', () => {
  const pool = band('a', -1.2, 4, 1);
  const r = buildRpeScale(pool, players('a', -1.2), ANCHORS);
  const ins = buildRpeInsights(r, 'td');

  it('부하가 오르면 RPE 가 오르는 집단에서 100% 상승으로 센다', () => {
    expect(ins.load.risingPct).toBe(100);
    expect(ins.load.medianDelta!).toBeGreaterThan(3); // 3,000 → 8,850 이면 +5.85점 근처
  });

  it('부하와 무관하게 RPE 가 일정하면 변화가 0 이다', () => {
    const flat = buildRpeInsights(buildRpeScale(band('b', -1.2, 6, 0), players('b', -1.2), ANCHORS), 'td');
    expect(flat.load.medianDelta).toBe(0);
  });
});

describe('성숙도 효과 — 방향을 세어서 말한다', () => {
  it('구간 순서대로 RPE 가 오르면 전부 단조로 센다', () => {
    const pool = [
      ...band('p', -1.2, 4.0, 1), ...band('q', 0.5, 4.5, 1),
      ...band('r', 1.5, 5.0, 1), ...band('s', 2.5, 5.5, 1),
    ];
    const ps = [...players('p', -1.2), ...players('q', 0.5), ...players('r', 1.5), ...players('s', 2.5)];
    const ins = buildRpeInsights(buildRpeScale(pool, ps, ANCHORS), 'td');
    expect(ins.maturity.comparisons).toBeGreaterThan(0);
    expect(ins.maturity.monotonic).toBe(ins.maturity.comparisons);
    expect(ins.maturity.medianTopMinusPre!).toBeCloseTo(1.5, 1);
  });

  it('순서가 뒤섞이면 단조가 줄어든다 — 단정하지 않게 하는 장치다', () => {
    const pool = [
      ...band('p', -1.2, 5.0, 1), ...band('q', 0.5, 4.0, 1),
      ...band('r', 1.5, 6.0, 1), ...band('s', 2.5, 4.5, 1),
    ];
    const ps = [...players('p', -1.2), ...players('q', 0.5), ...players('r', 1.5), ...players('s', 2.5)];
    const ins = buildRpeInsights(buildRpeScale(pool, ps, ANCHORS), 'td');
    expect(ins.maturity.monotonic).toBe(0);
    expect(ins.maturity.medianTopMinusPre!).toBeLessThan(0); // 2.5구간이 Pre 보다 낮다
  });

  it('네 구간이 다 있지 않은 부하 구간은 비교에서 뺀다', () => {
    const ins = buildRpeInsights(buildRpeScale(band('a', -1.2, 5, 1), players('a', -1.2), ANCHORS), 'td');
    expect(ins.maturity.comparisons).toBe(0);
    expect(ins.maturity.medianTopMinusPre).toBeNull();
  });
});

describe('민감도는 선수 내부에서 잰다', () => {
  it('부하에 둔한 집단보다 민감한 집단의 기울기가 크다', () => {
    const dull = buildRpeInsights(buildRpeScale(band('a', -1.2, 5, 0.2), players('a', -1.2), ANCHORS), 'td');
    const keen = buildRpeInsights(buildRpeScale(band('b', -1.2, 5, 1.5), players('b', -1.2), ANCHORS), 'td');
    const of = (i: ReturnType<typeof buildRpeInsights>) => i.sensitivity.find(s => s.band === 'pre')!.slope!;
    expect(of(keen)).toBeGreaterThan(of(dull));
  });
});

describe('해석을 약하게 만드는 것을 같이 돌려준다', () => {
  const r = buildRpeScale(band('a', -1.2, 5, 1), players('a', -1.2), ANCHORS);
  const ins = buildRpeInsights(r, 'td');

  it('칸 안 퍼짐을 센다 — 구간 간 차이와 견주기 위한 것', () => {
    expect(ins.caveats.medianWithinCellSpread!).toBeGreaterThan(0);
  });

  it('선수가 가장 적은 구간을 집어낸다', () => {
    expect(ins.caveats.thinnestBand).toEqual({ band: 'pre', players: 4 });
  });

  it('성숙도 측정일 범위를 같이 준다 (측정 1회 고지)', () => {
    expect(ins.caveats.measuredFrom).toBe('2026-07-02');
  });
});
