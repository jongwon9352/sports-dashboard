// MD 코드 규칙의 회귀 보호.
//
// 정답의 출처는 코치의 「2026 U15 주간 주기화」(Keynote)다 — 남의 팀 표가 아니라 우리 표다.
// 아래 두 주차는 그 표의 Periodization 행을 그대로 옮긴 것이고, 경기일은 DB(match_data)의
// event_type 으로 공식/연습을 확인했다.
//
// 주기화표의 규칙은 두 가지다.
//   1. 공식 경기만 MD 앵커다. 연습경기는 MD-4·MD-3 자리의 고부하 훈련이다.
//      (6월 4주의 6/23 연습경기가 표에 MD-4 로 적혀 있다 — 경기가 아니라 훈련 자극이다.)
//   2. 다음 공식 경기에서 1~5를 그대로 역산한다. 겹치면 역산이 이긴다.
//      (표의 「MD+2/-5」 이중 라벨이 그 뜻이다. 집계는 역산 라벨을 쓴다.)
//
// 이전 주석이 인용했던 scripts/selfcheck.ts 와 FC서울 표 케이스는 존재하지 않았고 기준도 달랐다.
// 이 파일이 그 자리를 대신한다.

import { describe, it, expect } from 'bun:test';
import { mdCodeForDays, toMatchDays, mergeMatchDates, mdCodeOrder } from './mdCode';

/** 날짜 배열에 라벨을 붙여 [날짜, 코드] 쌍으로 돌려준다 */
function label(dates: string[], officialMatches: string[]): [string, string | null][] {
  const days = toMatchDays(officialMatches);
  return dates.map(d => [d, mdCodeForDays(d, days).code]);
}

function week(start: string): string[] {
  const [y, m, d] = start.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: 7 }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}

describe('주기화표 14주차 — 5/18~5/24, 공식 경기 2연전(소년체전 5/23·5/24)', () => {
  // 표: Training ×5 → Match, Match / MD-5 MD-4 MD-3 MD-2 MD-1 MD MD
  const official = ['2026-05-23', '2026-05-24'];

  it('표의 일곱 칸과 정확히 일치한다', () => {
    expect(label(week('2026-05-18'), official)).toEqual([
      ['2026-05-18', 'MD-5'],
      ['2026-05-19', 'MD-4'],
      ['2026-05-20', 'MD-3'],
      ['2026-05-21', 'MD-2'],
      ['2026-05-22', 'MD-1'],
      ['2026-05-23', 'MD'],
      ['2026-05-24', 'MD'],
    ]);
  });
});

describe('주기화표 6월 4주 — 6/22~6/28, 공식 6/20·6/27 (6/23 은 연습경기)', () => {
  // 표: Rest, Game, Game, Training, Training, Match, Rest
  //     MD+2/-5  MD-4  MD-3  MD-2  MD-1  MD  MD+1
  // 6/20 과 6/27 만 공식(K리그주니어). 6/23 은 연습경기이므로 앵커가 아니다.
  const official = ['2026-06-20', '2026-06-27'];

  it('이중 라벨 날(6/22)은 역산이 이겨 MD-5 가 된다', () => {
    const [, code] = label(['2026-06-22'], official)[0];
    expect(code).toBe('MD-5');
  });

  it('연습경기일(6/23)이 MD 가 아니라 MD-4 로 라벨링된다', () => {
    const [, code] = label(['2026-06-23'], official)[0];
    expect(code).toBe('MD-4');
  });

  it('표의 일곱 칸과 일치한다 (이중 라벨은 역산 쪽을 취한다)', () => {
    expect(label(week('2026-06-22'), official)).toEqual([
      ['2026-06-22', 'MD-5'],
      ['2026-06-23', 'MD-4'],
      ['2026-06-24', 'MD-3'],
      ['2026-06-25', 'MD-2'],
      ['2026-06-26', 'MD-1'],
      ['2026-06-27', 'MD'],
      ['2026-06-28', 'MD+1'],
    ]);
  });
});

describe('7일 공식 간격 — 가장 흔한 간격(실측 52개 중 14회)', () => {
  const official = ['2026-04-01', '2026-04-08'];

  it('경기 이틀 뒤는 MD+2 가 아니라 MD-5 다', () => {
    // 역산 범위에서 회복일을 예약하면(backward = min(MAX, between - forward))
    // 7일 간격에서 backward 가 4로 묶여 이 날이 영영 MD-5 가 되지 못한다.
    const [, code] = label(['2026-04-03'], official)[0];
    expect(code).toBe('MD-5');
  });

  it('경기 다음날은 MD+1 이다 (역산 범위를 벗어난다)', () => {
    const [, code] = label(['2026-04-02'], official)[0];
    expect(code).toBe('MD+1');
  });

  it('간격 전체가 주기화 구간으로 덮인다 — null 이 없다', () => {
    const codes = label(week('2026-04-02'), official).map(([, c]) => c);
    expect(codes).toEqual(['MD+1', 'MD-5', 'MD-4', 'MD-3', 'MD-2', 'MD-1', 'MD']);
  });
});

describe('경계', () => {
  it('경기가 없으면 전부 null 이다', () => {
    expect(label(week('2026-03-02'), []).map(([, c]) => c)).toEqual(
      [null, null, null, null, null, null, null],
    );
  });

  it('같은 날 두 경기는 하나로 합쳐진다', () => {
    expect(toMatchDays(['2026-05-23', '2026-05-23'])).toHaveLength(1);
  });

  it('시즌 첫 경기 이전은 역산만 붙고, 5일을 넘으면 구간 밖이다', () => {
    // 공식 경기가 4/8 하나뿐이면 4/3(toNext=5)은 MD-5, 4/2(toNext=6)는 구간 밖이다.
    expect(label(['2026-04-02', '2026-04-03'], ['2026-04-08']).map(([, c]) => c))
      .toEqual([null, 'MD-5']);
  });

  it('시즌 마지막 경기 이후는 회복일만 붙는다', () => {
    expect(label(['2026-04-09', '2026-04-10', '2026-04-11'], ['2026-04-08']).map(([, c]) => c))
      .toEqual(['MD+1', 'MD+2', null]);
  });

  it('mergeMatchDates 는 중복을 제거하고 정렬한다', () => {
    expect(mergeMatchDates(['2026-06-27', '2026-06-20'], ['2026-06-20'])).toEqual(
      ['2026-06-20', '2026-06-27'],
    );
  });
});

describe('정렬 순서 — MD-5 가 MD-4 보다 앞이다', () => {
  it('리포트 표의 열 순서가 주기화표와 같다', () => {
    const codes = ['MD-1', 'MD-5', 'MD', 'MD+2', 'MD-3'];
    expect([...codes].sort((a, b) => mdCodeOrder(a) - mdCodeOrder(b))).toEqual(
      ['MD-5', 'MD-3', 'MD-1', 'MD', 'MD+2'],
    );
  });
});
