// 성숙도 × MD 격자 집계의 회귀 보호.
//
// 가장 중요한 두 가지.
//   D2/U6 — 표본 미달 칸이 숫자를 만들지 않는다. 그리고 부하 범위와 RPE 의 임계가 **다르다**.
//   D1b   — 연습경기는 total 에 들고 RPE 모집단(withRpe)에는 들지 않는다.
//
// 「0 이 아니라 null」이 핵심이다. 빈 집계가 0 을 내면 화면이 「적정 범위 0~0」을 그린다.

import { describe, it, expect } from 'bun:test';
import {
  buildRpeScale, rpeNear, MD_COLUMNS, LOAD_AXES,
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

describe('U6 — 부하 범위와 RPE 의 임계가 다르다', () => {
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

  it('연습경기가 RPE 모집단에는 들어가지 않는다 — RPE 를 받지 않기 때문이다', () => {
    expect(cell.withRpe).toBe(5);
  });

  it('부하 범위는 생기고 RPE 는 가려지는 혼합 상태가 가능하다', () => {
    expect(cell.suppressed).toBeNull();          // total 35 >= 30
    expect(cell.axes.td.p25).toBeGreaterThan(0);
    expect(cell.rpeSuppressed).toBe('sample');   // withRpe 5 < 30
    expect(cell.rpeMean).toBeNull();
  });
});

describe('칸 요약은 부하 전 구간과 RPE 전 구간을 담는다 (어느 쪽도 거르지 않는다)', () => {
  const pool = [
    ...cohort(3, 10, MD5, 4.0, 4000),   // 저부하·저RPE
    ...cohort(3, 10, MD5, 8.0, 9000),   // 고부하·고RPE
  ];
  const r = buildRpeScale(pool, cohortPlayers(3), ANCHORS);
  const cell = r.grid.find(c => c.band === 'pre' && c.md === 'MD-5')!;

  it('높은 RPE 쪽 세션의 부하도 범위에 반영된다', () => {
    expect(cell.total).toBe(60);
    expect(cell.withRpe).toBe(60);
    // 한쪽만 담았다면 p75 가 4,000대에 머문다.
    expect(cell.axes.td.p75!).toBeGreaterThan(8000);
  });

  it('평균 RPE 는 둘의 가운데고, 퍼짐을 같이 돌려준다', () => {
    expect(cell.rpeMean).toBe(6);
    expect(cell.rpeP25).toBe(4);
    expect(cell.rpeP75).toBe(8);
  });
});

describe('반응 곡선 — 부하 구간별 평균 RPE', () => {
  // 부하가 오르면 RPE 가 오르는 집단. 선이 우상향해야 한다.
  const pool = Array.from({ length: 120 }, (_, i) => {
    const td = 3000 + (i % 40) * 150;              // 3,000~8,850
    return row(`p${i % 4}`, MD5, 3 + (td - 3000) / 1000, td);
  });
  const r = buildRpeScale(pool, cohortPlayers(4), ANCHORS);
  const resp = r.response.find(x => x.band === 'pre' && x.md === 'MD-5' && x.axis === 'td')!;

  it('구간마다 평균 RPE 가 나오고 부하 순으로 오른다', () => {
    const got = resp.bins.filter(b => b.rpeMean != null).map(b => b.rpeMean as number);
    expect(got.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < got.length; i++) expect(got[i]).toBeGreaterThan(got[i - 1]);
  });

  it('표본이 없는 구간은 null 이다 — 선을 억지로 잇지 않는다', () => {
    const empty = buildRpeScale(cohort(3, 10, MD5, 5.0, 6000), cohortPlayers(3), ANCHORS)
      .response.find(x => x.band === 'y2p' && x.md === 'MD-5' && x.axis === 'td')!;
    expect(empty.bins.every(b => b.rpeMean === null)).toBe(true);
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

  it('성숙도 측정일 범위를 돌려준다 (측정 1회 고지용)', () => {
    const r = buildRpeScale(cohort(3, 10, MD5, 5.0), cohortPlayers(3), ANCHORS);
    expect(r.measuredAt).toEqual({ from: '2026-07-02', to: '2026-07-02' });
  });
});

describe('U1/D21 — 계획값 근처에서 나온 RPE (주간 시트 주석 행)', () => {
  // 7,000 근처는 RPE 7.5 가 20개 + 9.0 이 20개 → 평균 8.25.
  // 4,000 근처는 7.5 뿐 → 조건을 걸면 칸 평균과 다른 답이 나온다.
  const pool = [
    ...cohort(4, 5, MD3, 7.5, 7000),
    ...cohort(4, 5, MD3, 9.0, 7100),
    ...cohort(4, 8, MD3, 7.5, 4000),
  ];
  const r = buildRpeScale(pool, cohortPlayers(4), ANCHORS);

  it('7,000 ±500 의 평균 RPE', () => {
    const got = rpeNear(r.rows, 'pre', 'MD-3', 7000);
    expect(got.n).toBe(40);
    expect(got.rpeMean).toBe(8.25);
  });

  it('4,000 ±500 은 다른 값이다 — 조건을 걸면 칸 평균과 다른 답이 나온다', () => {
    const got = rpeNear(r.rows, 'pre', 'MD-3', 4000);
    expect(got.n).toBe(32);
    expect(got.rpeMean).toBe(7.5);
  });

  it('칸 전체 평균은 두 값 사이다 — 모든 부하를 뭉갠 결과다', () => {
    const cell = r.grid.find(c => c.band === 'pre' && c.md === 'MD-3')!;
    expect(cell.rpeMean!).toBeGreaterThan(7.5);
    expect(cell.rpeMean!).toBeLessThan(8.25);
  });

  it('근처 표본이 미달이면 null 이다', () => {
    const got = rpeNear(r.rows, 'pre', 'MD-3', 20000);
    expect(got.rpeMean).toBeNull();
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

describe('리그 주간 필터 — 대회 기간은 MD 주기화가 성립하지 않는다', () => {
  // 2026-06-01(월)~06-07(일) 이 리그 주간. 6/06 이 K리그주니어 경기다.
  // 2026-06-08~14 주는 리그 경기가 없는 주로 둔다.
  const LEAGUE = ['2026-06-06'];
  const inWeek = '2026-06-01';   // 월 — MD-5
  const outWeek = '2026-06-08';  // 다음 주 월 — 리그 경기 없는 주

  const pool = [...cohort(3, 10, inWeek, 5.0), ...cohort(3, 10, outWeek, 9.0)];
  const ps = cohortPlayers(3);

  it('리그 주간 밖 행이 빠지고 따로 세어진다', () => {
    const r = buildRpeScale(pool, ps, ANCHORS, LEAGUE);
    expect(r.included).toBe(30);
    expect(r.excluded.outsideLeagueWeek).toBe(30);
  });

  it('주는 월요일에 끊긴다 — 토요일 경기의 월~금이 같은 주다', () => {
    const r = buildRpeScale(
      [...cohort(3, 10, '2026-06-01', 5.0), ...cohort(3, 10, '2026-06-05', 5.0)],
      ps, ANCHORS, LEAGUE,
    );
    expect(r.included).toBe(60);           // 월·금 둘 다 같은 주
    expect(r.excluded.outsideLeagueWeek).toBe(0);
  });

  it('일요일은 그 주에 남고 그다음 월요일은 빠진다', () => {
    const r = buildRpeScale(
      [...cohort(3, 10, '2026-06-07', 5.0), ...cohort(3, 10, '2026-06-08', 5.0)],
      ps, ANCHORS, LEAGUE,
    );
    expect(r.excluded.outsideLeagueWeek).toBe(30); // 6/08(월)만 빠진다
  });

  it('null 이면 필터를 걸지 않는다 — 빈 배열과 다르다', () => {
    expect(buildRpeScale(pool, ps, ANCHORS, null).excluded.outsideLeagueWeek).toBe(0);
    expect(buildRpeScale(pool, ps, ANCHORS, []).included).toBe(0);
  });

  it('기본값은 필터 없음이다 — 기존 호출부가 조용히 바뀌지 않는다', () => {
    expect(buildRpeScale(pool, ps, ANCHORS).included).toBe(buildRpeScale(pool, ps, ANCHORS, null).included);
  });
});
