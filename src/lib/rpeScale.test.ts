// 성숙도 × MD 격자 집계의 회귀 보호.
//
// 가장 중요한 두 가지.
//   D2/U6 — 표본 미달 칸이 숫자를 만들지 않는다. 그리고 범위와 달성률의 임계가 **다르다**.
//   D1b   — 연습경기는 total 에 들고 달성률 모집단(withRpe)에는 들지 않는다.
//
// 「0 이 아니라 null」이 핵심이다. 빈 집계가 0 을 내면 화면이 「적정 범위 0~0」을 그린다.

import { describe, it, expect } from 'bun:test';
import {
  buildRpeScale, hitRateNear, MD_RPE_TARGET, MD_COLUMNS, LOAD_AXES,
  MIN_CELL_SESSIONS, MIN_CELL_PLAYERS, MIN_CELL_WITH_RPE,
  type PoolRow, type PlayerMaturity,
} from './rpeScale';

/** 2026-06-06 과 2026-06-13 이 공식 경기. 6/1=MD-5 … 6/5=MD-1 */
const ANCHORS = ['2026-06-06', '2026-06-13'];
const MD5 = '2026-06-01';
const MD3 = '2026-06-03';

function player(id: string, offset: number, birth = '2013-02-13'): PlayerMaturity {
  return { id, maturity_offset: offset, baseline_measured_at: '2026-07-02', birth_date: birth };
}

function row(p: string, date: string, rpe: number | null, td = 6000, extra: Partial<PoolRow> = {}): PoolRow {
  return {
    player_id: p, date, rpe, td, hsr: 150, sprint: 20, action: 40,
    group_type: 'U15', source: 'training', ...extra,
  };
}

/** n명 × m세션을 한 날짜에 만든다 */
function cohort(n: number, sessionsPerPlayer: number, date: string, rpe: number | null, td = 6000): PoolRow[] {
  const out: PoolRow[] = [];
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < sessionsPerPlayer; s++) out.push(row(`p${i}`, date, rpe, td + s));
  }
  return out;
}
const cohortPlayers = (n: number, offset = -1.2) =>
  Array.from({ length: n }, (_, i) => player(`p${i}`, offset));

describe('D2 — 표본 미달 칸은 숫자를 만들지 않는다 (0 이 아니라 null)', () => {
  it('세션 29개면 범위가 가려지고, 30개면 생긴다', () => {
    const under = buildRpeScale(cohort(3, 9, MD5, 5.0), cohortPlayers(3), ANCHORS); // 27
    const over = buildRpeScale(cohort(3, 10, MD5, 5.0), cohortPlayers(3), ANCHORS); // 30
    const cellOf = (r: typeof under) => r.grid.find(c => c.band === 'pre' && c.md === 'MD-5')!;
    expect(cellOf(under).suppressed).toBe('sample');
    expect(cellOf(under).axes.td.p25).toBeNull();
    expect(cellOf(over).suppressed).toBeNull();
    expect(cellOf(over).axes.td.p25).toBeGreaterThan(0);
  });

  it('선수 2명이면 세션이 많아도 가려진다 — 분포가 아니라 두 명의 기록이다', () => {
    const r = buildRpeScale(cohort(2, 40, MD5, 5.0), cohortPlayers(2), ANCHORS); // 80세션·2명
    const cell = r.grid.find(c => c.band === 'pre' && c.md === 'MD-5')!;
    expect(cell.total).toBe(80);
    expect(cell.players).toBe(2);
    expect(cell.suppressed).toBe('sample');
    expect(cell.axes.td.p25).toBeNull();
  });

  it('임계 상수가 설계값과 같다', () => {
    expect(MIN_CELL_SESSIONS).toBe(30);
    expect(MIN_CELL_PLAYERS).toBe(3);
    expect(MIN_CELL_WITH_RPE).toBe(30);
  });
});

describe('U6 — 범위와 달성률의 임계가 다르다', () => {
  // 연습경기 30개(RPE 없음) + 훈련 5개(RPE 있음) = total 35, withRpe 5
  const pool = [
    ...cohort(3, 10, MD5, null, 6000).map(r => ({ ...r, source: 'friendly' as const })),
    ...cohort(3, 2, MD5, 5.0, 7000).slice(0, 5),
  ];
  const r = buildRpeScale(pool, cohortPlayers(3), ANCHORS);
  const cell = r.grid.find(c => c.band === 'pre' && c.md === 'MD-5')!;

  it('연습경기가 total 에 들어간다', () => {
    expect(cell.total).toBe(35);
    expect(cell.friendly).toBe(30);
  });

  it('연습경기가 달성률 모집단에는 들어가지 않는다', () => {
    expect(cell.withRpe).toBe(5);
  });

  it('범위는 생기고 달성률은 가려지는 혼합 상태가 가능하다', () => {
    expect(cell.suppressed).toBeNull();          // total 35 >= 30
    expect(cell.axes.td.p25).toBeGreaterThan(0);
    expect(cell.hitSuppressed).toBe('sample');   // withRpe 5 < 30
    expect(cell.hitRate).toBeNull();
  });
});

describe('X1 — 1열은 칸 전체의 관측 범위다 (목표 밴드로 거르지 않는다)', () => {
  // MD-5 목표 밴드는 4.0~6.0. 밴드 밖(RPE 9)인 고부하 세션도 범위에 들어가야 한다.
  const pool = [
    ...cohort(3, 10, MD5, 5.0, 4000),   // 밴드 안, 저부하
    ...cohort(3, 10, MD5, 9.0, 9000).map(r => ({ ...r, player_id: r.player_id })), // 밴드 밖, 고부하
  ];
  const r = buildRpeScale(pool, cohortPlayers(3), ANCHORS);
  const cell = r.grid.find(c => c.band === 'pre' && c.md === 'MD-5')!;

  it('밴드 밖 세션의 부하도 범위에 반영된다', () => {
    expect(cell.total).toBe(60);
    expect(cell.withRpe).toBe(60);
    expect(cell.inBand).toBe(30);
    // 밴드로 걸렀다면 p75 가 4,000대에 머문다. 걸르지 않으면 9,000대까지 올라간다.
    expect(cell.axes.td.p75!).toBeGreaterThan(8000);
  });

  it('달성률은 밴드에 든 비율이다', () => {
    expect(cell.hitRate).toBe(50);
  });
});

describe('제외 내역 — 조용히 빠지는 행이 없다', () => {
  it('group_type 이 null 인 행을 센다', () => {
    const pool = [...cohort(3, 10, MD5, 5.0), row('p0', MD5, 5.0, 6000, { group_type: null })];
    const r = buildRpeScale(pool, cohortPlayers(3), ANCHORS);
    expect(r.excluded.noGroup).toBe(1);
  });

  it('GK·RE 를 센다', () => {
    const pool = [row('p0', MD5, 5.0, 6000, { group_type: 'GK' }), row('p0', MD5, 5.0, 6000, { group_type: 'RE' })];
    const r = buildRpeScale(pool, cohortPlayers(1), ANCHORS);
    expect(r.excluded.otherGroup).toBe(2);
  });

  it('성숙도 측정이 없는 선수를 센다', () => {
    const pool = [row('x', MD5, 5.0)];
    const r = buildRpeScale(pool, [{ id: 'x', maturity_offset: null, baseline_measured_at: null, birth_date: null }], ANCHORS);
    expect(r.excluded.noMaturity).toBe(1);
    expect(r.included).toBe(0);
  });

  it('18세 이상을 센다', () => {
    const pool = [row('a', MD5, 5.0)];
    const r = buildRpeScale(pool, [player('a', 1.0, '2001-02-19')], ANCHORS);
    expect(r.excluded.adult).toBe(1);
  });

  it('공식 경기일 행과 구간 밖 행을 나눠 센다', () => {
    const pool = [row('p0', '2026-06-06', 5.0), row('p0', '2026-02-01', 5.0)];
    const r = buildRpeScale(pool, cohortPlayers(1), ANCHORS);
    expect(r.excluded.matchDay).toBe(1);
    expect(r.excluded.outsideMd).toBe(1);
  });

  it('구간 경계 근접은 제외가 아니라 고지다 — included 에 남는다', () => {
    const pool = cohort(3, 10, MD5, 5.0);
    const near = buildRpeScale(pool, cohortPlayers(3, -0.05), ANCHORS); // 경계 0 에 근접
    expect(near.excluded.nearBoundary).toBe(30);
    expect(near.included).toBe(30);
  });
});

describe('격자 모양', () => {
  it('구간 4 × MD 5 = 20칸이 항상 생긴다 (빈 칸도 행이 있다)', () => {
    const r = buildRpeScale([], [], ANCHORS);
    expect(r.grid).toHaveLength(20);
    expect(r.grid.every(c => c.suppressed === 'sample')).toBe(true);
    expect(r.grid.every(c => c.axes.td.p25 === null)).toBe(true);
  });

  it('네 축을 한 번에 담는다 — 탭 전환에 재집계가 없다', () => {
    const r = buildRpeScale(cohort(3, 10, MD5, 5.0), cohortPlayers(3), ANCHORS);
    const cell = r.grid.find(c => c.band === 'pre' && c.md === 'MD-5')!;
    for (const ax of LOAD_AXES) expect(cell.axes[ax.key].p25).not.toBeUndefined();
  });

  it('MD 열 순서가 주기화표와 같다', () => {
    expect(MD_COLUMNS).toEqual(['MD-5', 'MD-4', 'MD-3', 'MD-2', 'MD-1']);
  });

  it('목표 밴드가 다섯 MD 에 모두 있고 하한 < 상한이다', () => {
    for (const md of MD_COLUMNS) {
      const t = MD_RPE_TARGET[md];
      expect(t).toBeDefined();
      expect(t[0]).toBeLessThan(t[1]);
    }
  });

  it('성숙도 측정일 범위를 돌려준다 (측정 1회 고지용)', () => {
    const r = buildRpeScale(cohort(3, 10, MD5, 5.0), cohortPlayers(3), ANCHORS);
    expect(r.measuredAt).toEqual({ from: '2026-07-02', to: '2026-07-02' });
  });
});

describe('U1/D21 — 계획값 근처 달성률 (주간 시트 주석 행)', () => {
  // 7,000 근처에 RPE 7.5(MD-3 밴드 안) 20개 + RPE 9.0(밖) 20개 → 50%
  // 4,000 근처에는 밴드 안만 둔다 → 조건을 걸면 값이 달라진다.
  const pool = [
    ...cohort(4, 5, MD3, 7.5, 7000),
    ...cohort(4, 5, MD3, 9.0, 7100),
    ...cohort(4, 8, MD3, 7.5, 4000),
  ];
  const r = buildRpeScale(pool, cohortPlayers(4), ANCHORS);

  it('7,000 ±500 에서는 50% 다', () => {
    const got = hitRateNear(r.rows, 'pre', 'MD-3', 7000);
    expect(got.n).toBe(40);
    expect(got.hitRate).toBe(50);
  });

  it('4,000 ±500 에서는 100% 다 — 조건을 걸면 칸 전체와 다른 답이 나온다', () => {
    const got = hitRateNear(r.rows, 'pre', 'MD-3', 4000);
    expect(got.n).toBe(32);
    expect(got.hitRate).toBe(100);
  });

  it('칸 전체 달성률은 두 값 사이다 — 모든 부하를 뭉갠 결과다', () => {
    const cell = r.grid.find(c => c.band === 'pre' && c.md === 'MD-3')!;
    expect(cell.hitRate).toBe(72); // (20 + 32) / 72
  });

  it('근처 표본이 미달이면 null 이다', () => {
    const got = hitRateNear(r.rows, 'pre', 'MD-3', 20000);
    expect(got.hitRate).toBeNull();
    expect(got.n).toBe(0);
  });
});

describe('X2 — 선수 내부 기울기', () => {
  it('부하가 오를 때 RPE 가 오르는 선수에서 양수가 나온다', () => {
    const pool: PoolRow[] = [];
    for (let i = 0; i < 3; i++) {
      for (let s = 0; s < 30; s++) {
        // 부하가 커질수록 RPE 도 커진다
        pool.push(row(`p${i}`, MD3, 4 + (s / 30) * 4, 4000 + s * 150));
      }
    }
    const r = buildRpeScale(pool, cohortPlayers(3), ANCHORS);
    const resp = r.response.find(x => x.band === 'pre' && x.md === 'MD-3' && x.axis === 'td')!;
    expect(resp.slopePlayers).toBe(3);
    expect(resp.withinPlayerSlope!).toBeGreaterThan(2);
  });

  it('세션이 적은 선수는 기울기에서 빠진다', () => {
    const r = buildRpeScale(cohort(3, 10, MD3, 5.0), cohortPlayers(3), ANCHORS);
    const resp = r.response.find(x => x.band === 'pre' && x.md === 'MD-3' && x.axis === 'td')!;
    expect(resp.slopePlayers).toBe(0);
    expect(resp.withinPlayerSlope).toBeNull();
  });
});
