// buildMatchAnnual 자체 점검. `bun run src/pages/matchAnnual.check.ts`
// 30분 필터·주 포지션 선택·백분위 계산이 깨지면 여기서 걸린다.
import assert from 'node:assert';
import { buildMatchAnnual, type MatchLike } from '../lib/matchAnnual';

const m = (o: Partial<MatchLike> & { play_time_min: number }): MatchLike => ({
  match_date: '2026-03-01', opponent: '상대', event_type: '연습경기', player_group: 'U14',
  position_played: 'CF', total_distance: 0, m_per_min: 0, hsr_distance: 0,
  sprint_distance: 0, sprint_count: 0, acc_count: 0, dec_count: 0, max_speed: 0, ...o,
});

// 30분 미만은 평균에서 빠지고 '뺀 경기'로 센다
{
  const own = [
    m({ play_time_min: 60, total_distance: 6000 }),
    m({ play_time_min: 10, total_distance: 2000 }),   // 짧은 출전 — 빠져야 한다
  ];
  const a = buildMatchAnnual(own, own)!;
  assert.equal(a.games, 1, '30분 이상만 센다');
  assert.equal(a.cutGames, 1);
  assert.equal(a.cutMinutes, 10);
  assert.equal(a.axes[0].me, 6000, '경기당 평균 m. 짧은 경기가 섞이면 4000 으로 내려간다');
}

// 주 포지션 = 30분 이상 경기가 가장 많은 자리. 비교군도 그 포지션으로 좁힌다
{
  const own = [
    m({ play_time_min: 60, position_played: 'CF', total_distance: 6000 }),
    m({ play_time_min: 60, position_played: 'CF', total_distance: 6000 }),
    m({ play_time_min: 60, position_played: 'MF', total_distance: 9000 }),
  ];
  const team = [...own, m({ play_time_min: 60, position_played: 'MF', total_distance: 9999 })];
  const a = buildMatchAnnual(own, team)!;
  assert.equal(a.pos, 'CF');
  assert.equal(a.games, 2, 'MF 경기는 내 평균에서 빠진다');
  assert.equal(a.cohortN, 2, '비교군도 CF 만');
}

// 백분위 = 비교군 경기 중 내 평균보다 낮은 비율
{
  const own = [m({ play_time_min: 60, total_distance: 6000 })];
  const team = [3000, 4800, 6000, 7200, 9000].map(v =>
    m({ play_time_min: 60, total_distance: v }));
  const a = buildMatchAnnual(own, team)!;
  assert.equal(a.axes[0].pct, 40, '5건 중 2건(3000·4800)이 낮으므로 40');
  assert.equal(a.axes[0].p[1], 6000, '중앙값');
}

// 최고 속도는 평균이 아니라 최댓값으로 모은다 (월별·대회별)
{
  const own = [
    m({ play_time_min: 60, max_speed: 28 }),
    m({ play_time_min: 60, max_speed: 31 }),
  ];
  const a = buildMatchAnnual(own, own)!;
  assert.equal(a.months[0].vals[7], 31, '월별 최고 속도는 최댓값(8번째 축)');
  assert.equal(a.peaks[0].v, 31);
}

// 경기 기록이 없거나 전부 짧으면 null — 리포트에서 두 쪽을 통째로 뺀다
assert.equal(buildMatchAnnual([], []), null);
assert.equal(buildMatchAnnual([m({ play_time_min: 5 })], []), null);

// 저장된 단위를 그대로 쓴다 — 분당으로 나누지 않는다
{
  const own = [m({ play_time_min: 50, sprint_distance: 120, sprint_count: 8, m_per_min: 118 })];
  const a = buildMatchAnnual(own, own)!;
  const by = (k: string) => a.axes.find(x => x.key === k)!.me;
  assert.equal(by('sprd'), 120, '전력질주는 경기당 전체 m');
  assert.equal(by('sprc'), 8, '전력질주 횟수는 경기당 회');
  assert.equal(by('mpm'), 118, '분당 거리는 DB 의 m_per_min 을 그대로 쓴다');
}

console.log('matchAnnual.check: 통과');
