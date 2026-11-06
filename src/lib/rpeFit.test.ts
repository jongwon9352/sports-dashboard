import { describe, expect, it } from 'bun:test';
import { buildRpeFit, FIT_TOLERANCE } from './rpeFit';
import type { RpeScaleResult, ScaleCell, ResponseRow } from './rpeScale';

const cell = (band: string, md: string, rpeMean: number | null, withRpe: number, p25: number, p75: number) => ({
  band, md, total: withRpe, friendly: 0, withRpe, players: 10,
  axes: { td: { p25, p75 }, hsr: { p25: 0, p75: 0 }, sprint: { p25: 0, p75: 0 }, action: { p25: 0, p75: 0 } },
  rpeMean, rpeP25: null, rpeP75: null, suppressed: null, rpeSuppressed: null,
}) as unknown as ScaleCell;

const row = (band: string, md: string, bins: { lo: number; hi: number; rpeMean: number | null; n: number }[]) => ({
  band, md, axis: 'td',
  bins: bins.map(b => ({ ...b, x: (b.lo + b.hi) / 2, rpeP25: null, rpeP75: null })),
  withinPlayerSlope: null, slopePlayers: 0,
}) as unknown as ResponseRow;

const scale = (grid: ScaleCell[], response: ResponseRow[]) => ({
  grid, response, excluded: {}, measuredAt: null, included: 0, rows: [],
}) as unknown as RpeScaleResult;

describe('buildRpeFit', () => {
  it('기준 RPE 는 세션 가중 평균이다 — 작은 칸이 같은 무게를 갖지 않는다', () => {
    const s = scale(
      [cell('pre', 'MD-3', 8.0, 200, 5000, 7000), cell('y2p', 'MD-3', 6.0, 20, 5000, 7000)],
      [],
    );
    const md3 = buildRpeFit(s, 'td').rows.find(r => r.md === 'MD-3')!;
    // 단순 평균이면 7.0, 가중이면 (8.0*200 + 6.0*20) / 220 = 7.8
    expect(md3.referenceRpe).toBe(7.8);
  });

  it('범위는 구간 경계가 아니라 실제 부하 중앙값이다 — 열린 끝 구간이 범위를 삼키지 않는다', () => {
    const s = scale(
      [cell('pre', 'MD-3', 8.0, 100, 6000, 7000)],
      [row('pre', 'MD-3', [
        { lo: 4000, hi: 5000, rpeMean: 6.0, n: 10 },  // 밖
        { lo: 5000, hi: 6000, rpeMean: 7.7, n: 20 },  // 안
        { lo: 6000, hi: 7000, rpeMean: 8.2, n: 30 },  // 안
        { lo: 7000, hi: 20000, rpeMean: 9.5, n: 15 },  // 밖 — hi 가 관측 최대값이다
      ])],
    );
    const c = buildRpeFit(s, 'td').rows.find(r => r.md === 'MD-3')!.cells.find(x => x.band === 'pre')!;
    // 맞는 구간은 5000~6000 과 6000~7000. 경계라면 5000~7000, 중앙값이면 5500~6500.
    expect(c.lo).toBe(5500);
    expect(c.hi).toBe(6500);
    expect(c.n).toBe(50);
  });

  it('맞는 구간이 없으면 범위 대신 가장 가까운 구간의 RPE 를 남긴다', () => {
    const s = scale(
      [cell('pre', 'MD-1', 6.0, 100, 4000, 5000)],
      [row('pre', 'MD-1', [{ lo: 4000, hi: 5000, rpeMean: 8.5, n: 40 }])],
    );
    const c = buildRpeFit(s, 'td').rows.find(r => r.md === 'MD-1')!.cells.find(x => x.band === 'pre')!;
    expect(c.lo).toBeNull();
    expect(c.nearestRpe).toBe(8.5);
    expect(c.verdict).toBeNull();
  });

  it('실제 소화량이 맞는 범위보다 적으면 below, 많으면 above 다', () => {
    const bins = [{ lo: 5000, hi: 6000, rpeMean: 7.0, n: 40 }];
    // 맞는 구간의 중앙값은 5500 하나뿐이라 범위는 5500~5500 이다.
    const low = scale([cell('pre', 'MD-4', 7.0, 100, 3000, 3500)], [row('pre', 'MD-4', bins)]);
    const high = scale([cell('pre', 'MD-4', 7.0, 100, 8000, 9000)], [row('pre', 'MD-4', bins)]);
    const mid = scale([cell('pre', 'MD-4', 7.0, 100, 5400, 5600)], [row('pre', 'MD-4', bins)]);
    const v = (s: RpeScaleResult) =>
      buildRpeFit(s, 'td').rows.find(r => r.md === 'MD-4')!.cells.find(x => x.band === 'pre')!.verdict;
    expect(v(low)).toBe('below');
    expect(v(high)).toBe('above');
    expect(v(mid)).toBe('within');
  });

  it('범위를 못 찾은 칸도 분모에 들어간다 — 신뢰도를 과장하지 않는다', () => {
    const s = scale(
      [cell('pre', 'MD-3', 8.0, 100, 6000, 7000)],
      [row('pre', 'MD-3', [{ lo: 4000, hi: 5000, rpeMean: 5.0, n: 40 }])],
    );
    const f = buildRpeFit(s, 'td');
    expect(f.matched).toBe(0);
    expect(f.cells).toBe(20); // 4구간 × 5 MD, 전부 미매칭
  });

  it('RPE 가 없는 칸만 있으면 기준 RPE 가 null 이다 — 0 이 아니다', () => {
    const f = buildRpeFit(scale([cell('pre', 'MD-5', null, 0, 0, 0)], []), 'td');
    expect(f.rows.find(r => r.md === 'MD-5')!.referenceRpe).toBeNull();
  });

  it('허용폭은 상수로 노출된다', () => {
    expect(FIT_TOLERANCE).toBe(0.5);
  });
});
