// ── 경기 연간 요약 ────────────────────────────────────────────────────
// 표현 단위는 DB 에 저장된 그대로 쓴다. match_data 는 거리를 경기별 전체 m,
// 가속·감속·스프린트를 경기별 횟수로 담고, 분당 지표는 m_per_min 하나뿐이다
// (GPS 장비 산출값). 없는 단위(HSR 분당 등)를 만들어 쓰면 현장에서 쓰는 말과 어긋난다.
//
// 30분 미만 출전은 뺀다. 경기당 절대값이라 10분 교체 출전의 거리·횟수를 풀타임과 같이
// 평균내면 숫자가 끌려 내려간다(김연후 2026: 64경기 중 30경기가 30분 미만).
export const MATCH_MIN_MINUTES = 30;

// 리포트·화면이 공유하는 구조. MatchData(선수 상세)와 MatchRow(전원 조회) 둘 다 만족한다.
export interface MatchLike {
  match_date: string; opponent: string; event_type: string; player_group: string | null;
  position_played: string | null; play_time_min: number;
  total_distance: number; m_per_min: number; hsr_distance: number;
  sprint_distance: number; sprint_count: number;
  acc_count: number; dec_count: number; max_speed: number;
}

// 경기당 평균으로 모은다. 최고 속도만 최댓값(평균 낼 지표가 아니다).
// of 는 저장값을 그대로 꺼낸다 — 나누거나 곱하지 않는다.
export const MATCH_AXES: {
  key: string; ko: string; unit: string; dec: number; peak?: true; of: (m: MatchLike) => number;
}[] = [
  { key: 'td', ko: '달린 거리', unit: 'm', dec: 0, of: m => m.total_distance },
  // 2025-11-12 이전 기록 15건은 m_per_min 이 0으로 저장돼 있다(거리·출전시간은 정상).
  // 그대로 평균내면 0이 섞여 월 평균이 1/6 로 주저앉는다(김동현 25.11: 23.7 m/분).
  // 같은 양이므로 거리÷시간으로 메운다.
  { key: 'mpm', ko: '분당 거리', unit: 'm/분', dec: 1,
    of: m => m.m_per_min > 0 ? m.m_per_min : (m.play_time_min > 0 ? m.total_distance / m.play_time_min : 0) },
  { key: 'hsr', ko: '빠르게', unit: 'm', dec: 0, of: m => m.hsr_distance },
  { key: 'sprd', ko: '전력질주 거리', unit: 'm', dec: 0, of: m => m.sprint_distance },
  { key: 'sprc', ko: '전력질주 횟수', unit: '회', dec: 1, of: m => m.sprint_count },
  { key: 'acc', ko: '급출발', unit: '회', dec: 1, of: m => m.acc_count },
  { key: 'dec', ko: '급정지', unit: '회', dec: 1, of: m => m.dec_count },
  { key: 'spd', ko: '최고 속도', unit: 'km/h', dec: 1, peak: true, of: m => m.max_speed },
];

// 화면(개인 Match 탭)은 두 칸으로 깔리므로 짝지어 읽히는 축을 한 줄에 놓는다.
// 리포트는 한 칸이라 위 MATCH_AXES 차례 그대로 쓴다. 축을 더하면 여기도 더해야 한다
// (matchAnnual.check.ts 가 두 목록이 같은지 본다).
export const AXIS_ROW_ORDER = ['td', 'mpm', 'hsr', 'spd', 'sprd', 'sprc', 'acc', 'dec'];

const longEnough = (m: MatchLike) => m.play_time_min >= MATCH_MIN_MINUTES;
const avgNum = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
// percentile_cont 와 같은 선형보간. 정렬된 배열을 받는다.
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export interface MatchAnnual {
  pos: string | null; games: number; minutes: number; avgMin: number;
  cutGames: number; cutMinutes: number; cohortN: number;
  axes: { key: string; ko: string; unit: string; dec: number; me: number; p: [number, number, number]; pct: number }[];
  months: { ym: string; games: number; minutes: number; vals: number[] }[];
  events: { name: string; games: number; minutes: number; vals: number[] }[];
  ageShare: [string, number][];
  peaks: { label: string; v: number; dec: number; unit: string; date: string; opp: string }[];
}

// own = 이 선수 전 경기, team = 전원 전 경기(팀 비교군 산출용).
// year 를 주면 그 해 경기만 센다. 리포트 머리글이 '{연도} 피지컬 리포트' 라
// 작년 경기가 섞이면 '올해 최고 속도'가 작년 기록이 된다.
export function buildMatchAnnual(own: MatchLike[], team: MatchLike[], year?: number): MatchAnnual | null {
  const inYear = (m: MatchLike) => year == null || m.match_date.slice(0, 4) === String(year);
  const played = own.filter(m => m.play_time_min > 0 && inYear(m));
  const kept = played.filter(longEnough);
  if (kept.length === 0) return null;

  // 주 포지션 = 30분 이상 경기가 가장 많은 자리. 비교군을 이 포지션으로 좁힌다.
  const byPos = new Map<string, number>();
  for (const m of kept) if (m.position_played) byPos.set(m.position_played, (byPos.get(m.position_played) ?? 0) + 1);
  const pos = [...byPos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const mine = pos ? kept.filter(m => m.position_played === pos) : kept;
  const cohort = team.filter(m => m.play_time_min > 0 && inYear(m) && longEnough(m) && (!pos || m.position_played === pos));

  // 주 포지션 경기 중 짧아서 빠진 것만 센다. played 전체로 세면 포지션이 달라 빠진 경기까지
  // 섞여 "30분보다 짧게 뛴 경기입니다" 라는 설명과 숫자가 어긋난다.
  const cut = played.filter(m => !longEnough(m) && (!pos || m.position_played === pos));
  const minutes = mine.reduce((a, m) => a + m.play_time_min, 0);

  const axes = MATCH_AXES.map(ax => {
    const me = avgNum(mine.map(ax.of));
    const pool = cohort.map(ax.of).sort((a, b) => a - b);
    const below = pool.filter(v => v < me).length;
    return {
      key: ax.key, ko: ax.ko, unit: ax.unit, dec: ax.dec, me,
      p: [quantile(pool, 0.1), quantile(pool, 0.5), quantile(pool, 0.9)] as [number, number, number],
      pct: pool.length ? Math.round(below / pool.length * 100) : 0,
    };
  });

  const group = <K extends string>(rows: MatchLike[], keyOf: (m: MatchLike) => K) => {
    const g = new Map<K, MatchLike[]>();
    for (const m of rows) { const k = keyOf(m); const l = g.get(k); if (l) l.push(m); else g.set(k, [m]); }
    return g;
  };
  const summarize = (rows: MatchLike[]) => ({
    games: rows.length,
    minutes: rows.reduce((a, m) => a + m.play_time_min, 0),
    vals: MATCH_AXES.map(ax => ax.peak ? Math.max(...rows.map(ax.of)) : avgNum(rows.map(ax.of))),
  });

  const months = [...group(mine, m => m.match_date.slice(0, 7))].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, rows]) => ({ ym, ...summarize(rows) }));
  const events = [...group(mine, m => m.event_type)].map(([name, rows]) => ({ name, ...summarize(rows) }))
    .sort((a, b) => b.games - a.games || b.minutes - a.minutes);
  const ageShare: [string, number][] = [...group(mine, m => m.player_group ?? '미지정')]
    .map(([nm, rows]) => [nm, rows.reduce((x, m) => x + m.play_time_min, 0)] as [string, number])
    .sort((x, y) => y[1] - x[1]);

  const best = (of: (m: MatchLike) => number) => mine.reduce((a, b) => of(b) > of(a) ? b : a);
  const pk = (label: string, of: (m: MatchLike) => number, dec: number, unit: string) => {
    const m = best(of);
    return { label, v: of(m), dec, unit, date: m.match_date, opp: m.opponent };
  };
  const peaks = [
    pk('최고 속도', m => m.max_speed, 1, 'km/h'),
    pk('전력질주 가장 많이', m => m.sprint_distance, 0, 'm'),
    pk('빠르게 가장 많이', m => m.hsr_distance, 0, 'm'),
    pk('가장 오래 뛴 경기', m => m.play_time_min, 0, '분'),
  ];

  return {
    pos, games: mine.length, minutes, avgMin: minutes / mine.length,
    cutGames: cut.length, cutMinutes: cut.reduce((a, m) => a + m.play_time_min, 0),
    cohortN: cohort.length, axes, months, events, ageShare, peaks,
  };
}
