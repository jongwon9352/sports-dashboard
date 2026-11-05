// 성숙도 × MD 격자의 집계. 부하 분포와 목표 RPE 달성률을 만든다.
//
// **이 화면은 처방이 아니라 관측이다.** 「이 성숙도엔 얼마가 적정」을 말하지 않는다 —
// 목표 RPE 밴드에 든 세션만 골라 그 부하의 중앙 50%를 적정이라 부르면 조건이 뒤집힌다.
// 계산되는 것은 `P(부하 | RPE 달성)` 인데 처방에 필요한 것은 `P(RPE 달성 | 부하)` 다.
// 그래서 1열은 **칸 전체의 관측 범위**(밴드 필터 없음)이고, 2열이 **달성률**이다.
// 근거: Pre-PHV MD-1 에서 밴드에 든 세션은 438 중 119(27%)뿐이고, 그 구간의 실제
// 달성률은 42% 였다. 더 낮은 거리가 44% 로 오히려 높았다.
//
// 주간 계획에 쓸 숫자는 여기서 나오지 않는다. 그쪽은 periodizationPlan.ts 가 만든다
// (그 화면은 「계획 초안」, 이 화면은 「관측 범위」 — 용어를 섞지 않는다).

import { mdCodesFor } from './mdCode';
import { quantile } from './matchAnnual';
import {
  MATURITY_BANDS, maturityBandFor, yearsFromPhv, isNearBandBoundary,
  type MaturityBandKey, type MaturityInput,
} from './maturity';

// ── 지정값 ──────────────────────────────────────────────────────────────
// 아래 네 묶음이 이 모듈의 유일한 「사람이 정한 숫자」다. 나머지는 데이터에서 나온다.

/**
 * MD별 목표 RPE 밴드. 주기화표 Intensity% 의 상대 서열(MD-3 최고 → MD-1 최저)을 따랐다.
 * 실측 평균은 다섯 다 이 밴드의 상한 위였다 — 평가 PPT 의 「오버됨」과 일치한다.
 * 달성률의 기준으로만 쓴다. 이 값으로 부하를 거르지 않는다.
 */
export const MD_RPE_TARGET: Readonly<Record<string, readonly [number, number]>> = {
  'MD-5': [4.0, 6.0],
  'MD-4': [6.0, 7.0],
  'MD-3': [7.0, 8.0],
  'MD-2': [5.0, 6.5],
  'MD-1': [4.0, 5.5],
};

/** 격자의 열 순서 — 주기화표와 같다(경기에서 먼 날이 왼쪽). */
export const MD_COLUMNS = ['MD-5', 'MD-4', 'MD-3', 'MD-2', 'MD-1'] as const;

/**
 * 칸에 숫자를 쓸 최소 표본. 두 임계가 **다르다**(U6).
 *   관측 범위 — 칸 전체 세션으로 재므로 total 과 players 를 본다.
 *   달성률   — RPE 가 있는 세션으로만 재므로 withRpe 를 본다.
 * 연습경기는 total 에 들고 withRpe 에 안 들어가므로, 한 칸이 「범위는 있고 달성률은 가려짐」이
 * 될 수 있다. 현재 데이터의 상위 3구간은 withRpe 81~433 이라 발생하지 않지만 구조적으로 가능하다.
 */
export const MIN_CELL_SESSIONS = 30;
export const MIN_CELL_PLAYERS = 3;
export const MIN_CELL_WITH_RPE = 30;

/** 이 화면의 모집단 — 중등부 전원. 골키퍼와 RE 그룹은 주행 부하의 종류가 다르다. */
export const ALLOWED_GROUP_TYPES = ['U15', 'U14', 'U13'] as const;

// ── 지표 축 ─────────────────────────────────────────────────────────────
// 단위는 DB 저장값 그대로다. 없는 단위를 만들어 쓰면 현장에서 쓰는 말과 어긋난다
// (matchAnnual.ts 의 MATCH_AXES 와 같은 관례).

export type LoadAxisKey = 'td' | 'hsr' | 'sprint' | 'action';

export const LOAD_AXES: readonly { key: LoadAxisKey; ko: string; unit: string }[] = [
  { key: 'td', ko: '달린 거리', unit: 'm' },
  { key: 'hsr', ko: '빠르게', unit: 'm' },
  { key: 'sprint', ko: '전력질주', unit: 'm' },
  // Action 은 계획값이 없다. 주기화표는 ACC/DEC 를 Very Low~Very High 서열로만 적는다.
  { key: 'action', ko: '액션', unit: '회' },
] as const;

/** 주간 시트 주석 행이 쓰는 축과 창(U1/D21). TD 만 쓴다 — 코치의 계획 단위다. */
export const ANNOTATION_AXIS: LoadAxisKey = 'td';
export const ANNOTATION_WINDOW = 500;

// ── 입력 ────────────────────────────────────────────────────────────────

/** 훈련 풀 한 줄. 연습경기는 rpe 가 null 이다 — match_data.rpe 는 상수 10 이라 읽지 않는다. */
export interface PoolRow {
  player_id: string;
  date: string;
  /** 선수가 보고한 RPE. 연습경기·미입력은 null */
  rpe: number | null;
  td: number;
  hsr: number;
  sprint: number;
  action: number;
  group_type: string | null;
  source: 'training' | 'friendly';
}

export interface PlayerMaturity extends MaturityInput {
  id: string;
}

// ── 출력 ────────────────────────────────────────────────────────────────

export interface AxisStats {
  /** 관측 범위. 표본 미달이면 null 이다 — 0 이 아니다. */
  p25: number | null;
  p75: number | null;
}

export interface ScaleCell {
  band: MaturityBandKey;
  md: string;
  /** 칸 전체 세션 (연습경기 포함) */
  total: number;
  /** 그 중 연습경기 — RPE 가 없어 달성률에 기여하지 않는다 */
  friendly: number;
  /** RPE 가 있는 세션 */
  withRpe: number;
  /** 목표 밴드에 든 세션 — 달성률의 분자 */
  inBand: number;
  players: number;
  axes: Record<LoadAxisKey, AxisStats>;
  /** 목표 RPE 달성률(%). 표본 미달이면 null */
  hitRate: number | null;
  /** 관측 범위를 가린 이유 */
  suppressed: 'sample' | null;
  /** 달성률을 가린 이유 — 임계가 범위와 다르다(U6) */
  hitSuppressed: 'sample' | null;
}

export interface ResponseBin {
  /** 구간 경계 [lo, hi) */
  lo: number;
  hi: number;
  n: number;
  /** 그 구간의 평균 RPE */
  rpeMean: number | null;
  /** 그 구간의 목표 RPE 달성률(%) */
  hitRate: number | null;
}

export interface ResponseRow {
  band: MaturityBandKey;
  md: string;
  axis: LoadAxisKey;
  bins: ResponseBin[];
  /**
   * 선수 내부 기울기 — 각 선수의 상위 1/3 부하일 평균 RPE − 하위 1/3 평균.
   * 구간 평균 차이만으로 성숙도 효과를 단정하면 선수 구성이 섞인다. 집단 간 비교에서는
   * 기울기가 성숙도 순서대로 커졌지만 선수 내부로 보면 그 순서가 성립하지 않았다.
   */
  withinPlayerSlope: number | null;
  slopePlayers: number;
}

export interface ExcludedCounts {
  /** 성숙도 측정이 없는 선수의 세션 */
  noMaturity: number;
  /** 18세 이상 — Mirwald 공식 유효 범위 밖 */
  adult: number;
  /** group_type 이 없는 행 — IN 절에서 조용히 빠지므로 반드시 센다 */
  noGroup: number;
  /** 골키퍼·RE 그룹 */
  otherGroup: number;
  /** 공식 경기일에 찍힌 행 */
  matchDay: number;
  /** MD-5~MD-1 밖 */
  outsideMd: number;
  /** 구간 경계 ±0.15년 — 제외가 아니라 신뢰도 고지다 */
  nearBoundary: number;
}

export interface RpeScaleResult {
  grid: ScaleCell[];
  response: ResponseRow[];
  excluded: ExcludedCounts;
  /** 성숙도 측정일 범위 — 화면이 「측정 1회 기준 추정」을 밝히는 데 쓴다(R6) */
  measuredAt: { from: string; to: string } | null;
  /** 격자에 들어간 세션 총수 */
  included: number;
  /**
   * 라벨(성숙도 구간·MD)이 붙은 행. 주간 시트 주석 행(hitRateNear)이 이것을 그대로 쓴다 —
   * 라벨링을 두 번 구현하면 두 화면이 다른 날을 같은 MD 라 부르게 된다.
   */
  rows: LabelledRow[];
}

// ── 집계 ────────────────────────────────────────────────────────────────

export interface LabelledRow extends PoolRow {
  band: MaturityBandKey;
  md: string;
}

const AXIS_OF: Record<LoadAxisKey, (r: PoolRow) => number> = {
  td: r => r.td,
  hsr: r => r.hsr,
  sprint: r => r.sprint,
  action: r => r.action,
};

function inTargetBand(md: string, rpe: number): boolean {
  const t = MD_RPE_TARGET[md];
  return t != null && rpe >= t[0] && rpe <= t[1];
}

/**
 * 격자와 반응 곡선을 한 번에 만든다. 축마다 다시 순회하지 않는다 —
 * 지표 탭을 바꿀 때 재집계가 돌면 주간 1회 쓰는 화면이 매번 멈춘다.
 */
export function buildRpeScale(
  pool: PoolRow[],
  players: PlayerMaturity[],
  officialMatchDates: string[],
): RpeScaleResult {
  const byId = new Map(players.map(p => [p.id, p]));
  const dates = [...new Set(pool.map(r => r.date))];
  const mdByDate = mdCodesFor(dates, officialMatchDates);

  const excluded: ExcludedCounts = {
    noMaturity: 0, adult: 0, noGroup: 0, otherGroup: 0,
    matchDay: 0, outsideMd: 0, nearBoundary: 0,
  };

  const rows: LabelledRow[] = [];
  for (const r of pool) {
    if (r.group_type == null || r.group_type === '') { excluded.noGroup++; continue; }
    if (!(ALLOWED_GROUP_TYPES as readonly string[]).includes(r.group_type)) { excluded.otherGroup++; continue; }

    const p = byId.get(r.player_id);
    if (p == null || p.maturity_offset == null || p.baseline_measured_at == null || p.birth_date == null) {
      excluded.noMaturity++; continue;
    }
    const band = maturityBandFor(p, r.date);
    if (band == null) { excluded.adult++; continue; }

    const md = mdByDate.get(r.date)?.code ?? null;
    if (md === 'MD') { excluded.matchDay++; continue; }
    if (md == null || !(MD_COLUMNS as readonly string[]).includes(md)) { excluded.outsideMd++; continue; }

    if (isNearBandBoundary(yearsFromPhv(p.maturity_offset, p.baseline_measured_at, r.date))) {
      excluded.nearBoundary++;
    }
    rows.push({ ...r, band, md });
  }

  const measuredDates = players
    .map(p => p.baseline_measured_at)
    .filter((d): d is string => d != null)
    .sort();

  return {
    grid: buildGrid(rows),
    response: buildResponse(rows),
    excluded,
    included: rows.length,
    rows,
    measuredAt: measuredDates.length
      ? { from: measuredDates[0], to: measuredDates[measuredDates.length - 1] }
      : null,
  };
}

function buildGrid(rows: LabelledRow[]): ScaleCell[] {
  const cells: ScaleCell[] = [];
  for (const b of MATURITY_BANDS) {
    for (const md of MD_COLUMNS) {
      const cell = rows.filter(r => r.band === b.key && r.md === md);
      const withRpe = cell.filter(r => r.rpe != null);
      const inBand = withRpe.filter(r => inTargetBand(md, r.rpe as number));
      const players = new Set(cell.map(r => r.player_id)).size;

      const enoughRange = cell.length >= MIN_CELL_SESSIONS && players >= MIN_CELL_PLAYERS;
      const enoughHit = withRpe.length >= MIN_CELL_WITH_RPE && players >= MIN_CELL_PLAYERS;

      const axes = {} as Record<LoadAxisKey, AxisStats>;
      for (const ax of LOAD_AXES) {
        if (!enoughRange) { axes[ax.key] = { p25: null, p75: null }; continue; }
        const sorted = cell.map(AXIS_OF[ax.key]).sort((x, y) => x - y);
        axes[ax.key] = { p25: Math.round(quantile(sorted, 0.25)), p75: Math.round(quantile(sorted, 0.75)) };
      }

      cells.push({
        band: b.key, md,
        total: cell.length,
        friendly: cell.filter(r => r.source === 'friendly').length,
        withRpe: withRpe.length,
        inBand: inBand.length,
        players,
        axes,
        hitRate: enoughHit ? Math.round((inBand.length / withRpe.length) * 100) : null,
        suppressed: enoughRange ? null : 'sample',
        hitSuppressed: enoughHit ? null : 'sample',
      });
    }
  }
  return cells;
}

/** 부하 구간 경계. 축마다 규모가 달라 고정 상수를 두지 않고 분포에서 뽑는다. */
function binEdges(values: number[], count = 4): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.05);
  const hi = quantile(sorted, 0.95);
  if (!(hi > lo)) return [];
  const step = (hi - lo) / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(lo + step * i));
}

function buildResponse(rows: LabelledRow[]): ResponseRow[] {
  const out: ResponseRow[] = [];
  for (const ax of LOAD_AXES) {
    const edges = binEdges(rows.map(AXIS_OF[ax.key]));
    for (const b of MATURITY_BANDS) {
      for (const md of MD_COLUMNS) {
        const cell = rows.filter(r => r.band === b.key && r.md === md);
        const bins: ResponseBin[] = [];
        for (let i = 0; i < Math.max(0, edges.length - 1); i++) {
          const lo = edges[i], hi = edges[i + 1];
          const last = i === edges.length - 2;
          const inBin = cell.filter(r => {
            const v = AXIS_OF[ax.key](r);
            return v >= lo && (last ? true : v < hi);
          });
          const rpes = inBin.map(r => r.rpe).filter((v): v is number => v != null);
          const hits = rpes.filter(v => inTargetBand(md, v)).length;
          bins.push({
            lo, hi, n: inBin.length,
            rpeMean: rpes.length ? Math.round((rpes.reduce((a, c) => a + c, 0) / rpes.length) * 100) / 100 : null,
            hitRate: rpes.length >= MIN_CELL_WITH_RPE ? Math.round((hits / rpes.length) * 100) : null,
          });
        }
        const slope = withinPlayerSlope(cell, ax.key);
        out.push({ band: b.key, md, axis: ax.key, bins, withinPlayerSlope: slope.value, slopePlayers: slope.players });
      }
    }
  }
  return out;
}

/** 선수 1인당 상위 1/3 − 하위 1/3 부하일의 평균 RPE 차. 최소 세션 수를 넘는 선수만 센다. */
const MIN_SLOPE_SESSIONS = 20;

function withinPlayerSlope(
  cell: LabelledRow[], axis: LoadAxisKey,
): { value: number | null; players: number } {
  const byPlayer = new Map<string, LabelledRow[]>();
  for (const r of cell) {
    if (r.rpe == null) continue;
    const l = byPlayer.get(r.player_id) ?? [];
    l.push(r);
    byPlayer.set(r.player_id, l);
  }
  const slopes: number[] = [];
  for (const list of byPlayer.values()) {
    if (list.length < MIN_SLOPE_SESSIONS) continue;
    const sorted = [...list].sort((a, b) => AXIS_OF[axis](a) - AXIS_OF[axis](b));
    const third = Math.floor(sorted.length / 3);
    if (third === 0) continue;
    const mean = (xs: LabelledRow[]) => xs.reduce((a, c) => a + (c.rpe as number), 0) / xs.length;
    slopes.push(mean(sorted.slice(-third)) - mean(sorted.slice(0, third)));
  }
  if (slopes.length === 0) return { value: null, players: 0 };
  const v = slopes.reduce((a, c) => a + c, 0) / slopes.length;
  return { value: Math.round(v * 100) / 100, players: slopes.length };
}

/**
 * 주간 시트 주석 행(U1/D21) — 계획값 근처에서 목표 RPE 를 맞춘 비율.
 *
 * 칸 전체 달성률이 아니라 **코치가 쓰려는 값 ±window** 로 조건을 건다. 칸 전체로 재면
 * 모든 부하가 뭉개져 13~48% 가 되지만, 특정 부하로 조건을 걸면 47~62% 가 나온다.
 * 사전 계산한 고정 빈을 쓰지 않는다 — 6,999 와 7,001 이 다른 빈에 떨어지는 경계 불안정이 있다.
 */
export function hitRateNear(
  rows: readonly LabelledRow[],
  band: MaturityBandKey,
  md: string,
  value: number,
  axis: LoadAxisKey = ANNOTATION_AXIS,
  window = ANNOTATION_WINDOW,
): { hitRate: number | null; n: number; players: number } {
  const near = rows.filter(r =>
    r.band === band && r.md === md && r.rpe != null
    && Math.abs(AXIS_OF[axis](r) - value) <= window);
  const players = new Set(near.map(r => r.player_id)).size;
  if (near.length < MIN_CELL_WITH_RPE || players < MIN_CELL_PLAYERS) {
    return { hitRate: null, n: near.length, players };
  }
  const hits = near.filter(r => inTargetBand(md, r.rpe as number)).length;
  return { hitRate: Math.round((hits / near.length) * 100), n: near.length, players };
}
