// 격자·히트맵에서 읽히는 것을 문장으로 만들기 위한 요약 통계.
//
// **문장을 하드코딩하지 않는다.** 숫자가 바뀌면 문장도 바뀌어야 한다 — 화면에 박아 둔 해석은
// 데이터가 늘면 조용히 거짓말이 된다. 그래서 여기서 수치를 내고, 화면은 그 수치로 문장을 만든다.
//
// 해석의 강도도 여기서 정한다. 「성숙할수록 힘들어한다」처럼 방향을 단정하려면 구간 순서가
// 실제로 유지되는지를 세야 한다(monotonic). 세지 않고 단정했다가 한 번 틀린 적이 있다.

import { MATURITY_BANDS, type MaturityBandKey } from './maturity';
import { MD_COLUMNS, type LoadAxisKey, type RpeScaleResult } from './rpeScale';
import { weekKey } from './mdCode';

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface RpeInsights {
  sessions: number;
  players: number;
  from: string | null;
  to: string | null;
  /** 주 1경기 리듬이 깨진 주(대회 기간)라서 뺀 세션 */
  excludedOutsideLeagueWeek: number;
  /** 집계에 남은 주의 수 */
  weeks: number;

  /** 부하 효과 — 한 칸 안에서 최저 부하 구간 → 최고 부하 구간의 RPE 변화 */
  load: {
    cells: number;
    /** 오른 칸의 비율(%) */
    risingPct: number | null;
    /** 변화폭 중앙값(점) */
    medianDelta: number | null;
  };

  /** 성숙도 효과 — 같은 부하 구간에서 성숙도 순서대로 RPE 가 가는가 */
  maturity: {
    comparisons: number;
    /** 네 구간이 한 방향으로 정렬된 비교의 수 */
    monotonic: number;
    /** 가장 성숙한 구간 − Pre-PHV 의 중앙값(점). 음수면 성숙한 쪽이 덜 힘들어했다 */
    medianTopMinusPre: number | null;
  };

  /** MD 효과 — MD별 전체 평균 RPE (세션 수 가중) */
  byMd: { md: string; rpeMean: number | null }[];

  /**
   * 부하 민감도 — 선수 **내부** 기울기의 구간별 중앙값.
   * 구간 간 평균 비교는 선수 구성이 섞이므로, 같은 선수 안에서 재야 성숙도 효과라 말할 수 있다.
   */
  sensitivity: { band: MaturityBandKey; slope: number | null; players: number }[];

  /** 해석을 약하게 만드는 것들 — 화면에 같이 적는다 */
  caveats: {
    /** 한 칸 안 RPE 퍼짐(p75 − p25)의 중앙값. 구간 간 차이와 견줘 본다 */
    medianWithinCellSpread: number | null;
    /** 성숙도 구간 경계 ±0.15년에 걸친 세션 */
    nearBoundary: number;
    /** 성숙도 측정일 범위 */
    measuredFrom: string | null;
    measuredTo: string | null;
    /** 선수가 가장 적은 성숙도 구간 */
    thinnestBand: { band: MaturityBandKey; players: number } | null;
  };
}

export function buildRpeInsights(scale: RpeScaleResult, axis: LoadAxisKey): RpeInsights {
  const resp = scale.response.filter(r => r.axis === axis);

  // 부하 효과 — 구간이 3개 이상 살아 있는 칸만 센다. 둘뿐이면 「변화」라 부르기 약하다.
  const deltas: number[] = [];
  for (const r of resp) {
    const b = r.bins.filter(x => x.rpeMean != null);
    if (b.length >= 3) deltas.push((b[b.length - 1].rpeMean as number) - (b[0].rpeMean as number));
  }

  // 성숙도 효과 — 같은 부하 구간에서 네 구간이 다 있는 비교만 센다.
  let monotonic = 0;
  const topMinusPre: number[] = [];
  for (const md of MD_COLUMNS) {
    const rows = MATURITY_BANDS.map(b => resp.find(r => r.band === b.key && r.md === md));
    const binCount = Math.max(0, ...rows.map(r => r?.bins.length ?? 0));
    for (let i = 0; i < binCount; i++) {
      const v = rows.map(r => r?.bins[i]?.rpeMean ?? null);
      if (v.some(x => x == null)) continue;
      const vals = v as number[];
      topMinusPre.push(vals[vals.length - 1] - vals[0]);
      const up = vals.every((x, j) => j === 0 || x >= vals[j - 1]);
      const down = vals.every((x, j) => j === 0 || x <= vals[j - 1]);
      if (up || down) monotonic++;
    }
  }

  const byMd = MD_COLUMNS.map(md => {
    const cells = scale.grid.filter(c => c.md === md && c.rpeMean != null);
    const n = cells.reduce((a, c) => a + c.withRpe, 0);
    return {
      md,
      rpeMean: n > 0 ? round2(cells.reduce((a, c) => a + (c.rpeMean as number) * c.withRpe, 0) / n) : null,
    };
  });

  const sensitivity = MATURITY_BANDS.map(b => {
    const rows = resp.filter(r => r.band === b.key && r.withinPlayerSlope != null);
    return {
      band: b.key,
      slope: median(rows.map(r => r.withinPlayerSlope as number)),
      players: rows.reduce((a, r) => a + r.slopePlayers, 0),
    };
  });

  const spreads = scale.grid
    .filter(c => c.rpeP25 != null && c.rpeP75 != null)
    .map(c => (c.rpeP75 as number) - (c.rpeP25 as number));

  const bandPlayers = MATURITY_BANDS
    .map(b => ({ band: b.key, players: new Set(scale.rows.filter(r => r.band === b.key).map(r => r.player_id)).size }))
    .filter(x => x.players > 0)
    .sort((a, b) => a.players - b.players);

  const dates = scale.rows.map(r => r.date).sort();

  return {
    sessions: scale.included,
    players: new Set(scale.rows.map(r => r.player_id)).size,
    excludedOutsideLeagueWeek: scale.excluded.outsideLeagueWeek,
    weeks: new Set(scale.rows.map(r => weekKey(r.date))).size,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    load: {
      cells: deltas.length,
      risingPct: deltas.length ? Math.round((deltas.filter(d => d > 0).length / deltas.length) * 100) : null,
      medianDelta: deltas.length ? round2(median(deltas) as number) : null,
    },
    maturity: {
      comparisons: topMinusPre.length,
      monotonic,
      medianTopMinusPre: topMinusPre.length ? round2(median(topMinusPre) as number) : null,
    },
    byMd,
    sensitivity,
    caveats: {
      medianWithinCellSpread: spreads.length ? round2(median(spreads) as number) : null,
      nearBoundary: scale.excluded.nearBoundary,
      measuredFrom: scale.measuredAt?.from ?? null,
      measuredTo: scale.measuredAt?.to ?? null,
      thinnestBand: bandPlayers[0] ?? null,
    },
  };
}
