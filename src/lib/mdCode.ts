// 훈련일에 MD 코드(경기일 기준 상대 위치)를 붙인다.
// 주간 주기화(계획) · 훈련일지(기록) · GPS 지표(결과)를 잇는 공통 키다.
// 순수 함수만 둔다 — 경기일 목록을 인자로 받고, DB나 네트워크를 모른다.
//
// 규칙의 출처는 코치의 「2026 U15 주간 주기화」(Keynote)다. 핵심은 두 가지다.
//   1. 다음 경기에서 1~5를 그대로 거꾸로 센다(MD-1이 경기 전날).
//   2. 회복일(MD+1, MD+2)은 역산이 닿지 않는 날에만 붙는다 — 역산이 먼저다.
// 표의 「MD+2/-5」 이중 라벨이 2번의 뜻이다. 한 날이 둘 다일 때 훈련 성격을 정하는 쪽은 역산이고,
// 회복 맥락이 필요한 곳은 같이 반환하는 daysSincePrevMatch 를 쓴다(periodizationPlan 의 회복 가드).
//
// 앵커는 공식 경기만이다. 연습경기는 MD-4·MD-3 자리의 고부하 훈련이다 — 표의 6월 4주에서
// 6/23 연습경기가 MD-4 로 적혀 있다. 이 함수는 날짜 배열만 받으므로 그 필터는 호출부 책임이다
// (api.fetchMdAnchorDates).
//
// 검증: src/lib/mdCode.test.ts — 주기화표 14주차·6월 4주와 7일 간격을 표 그대로 단정한다.

/** 경기 직후 회복일로 붙일 최대 일수 (MD+1, MD+2) */
const MAX_FORWARD = 2;
/** 경기 전 준비일로 거꾸로 채울 최대 일수 (MD-5 ~ MD-1) */
const MAX_BACKWARD = 5;

export interface MdLabel {
  /** 'MD' | 'MD-1'~'MD-4' | 'MD+1'~'MD+2' | null(주기화 구간 밖) */
  code: string | null;
  /** 다음 경기까지 남은 일수. 다음 경기가 없으면 null. 당일 경기면 0 */
  daysToNextMatch: number | null;
  /** 직전 경기로부터 지난 일수. 직전 경기가 없으면 null. 당일 경기면 0 */
  daysSincePrevMatch: number | null;
}

const NO_LABEL: MdLabel = { code: null, daysToNextMatch: null, daysSincePrevMatch: null };

// YYYY-MM-DD를 "일 번호"로 바꾼다. Date.UTC로 통일해 시간대·서머타임을 아예 배제한다.
// (new Date('2026-07-28')는 UTC 자정으로 파싱돼 KST에서 하루 어긋난다 — 이 프로젝트에서
//  이미 세 번 겪은 버그다. src/lib/date.ts 주석 참고.)
export function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** 경기일 문자열 배열 → 중복 제거·정렬된 일 번호 배열. 같은 날 두 경기는 하나로 합쳐진다. */
export function toMatchDays(matchDates: string[]): number[] {
  return [...new Set(matchDates.map(toDayNumber))].sort((a, b) => a - b);
}

// 정렬된 배열에서 target 미만인 마지막 값의 인덱스 (없으면 -1)
function lastIndexBelow(sorted: number[], target: number): number {
  let lo = 0, hi = sorted.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

/**
 * 하루에 MD 코드를 붙인다.
 * 경기일 목록을 매번 정렬하지 않으려면 toMatchDays()로 미리 만든 배열을 mdCodeForDays()에 넘긴다.
 */
export function mdCodeFor(date: string, matchDates: string[]): MdLabel {
  return mdCodeForDays(date, toMatchDays(matchDates));
}

/** mdCodeFor의 대량 처리용 — toMatchDays()로 준비한 배열을 재사용한다. */
export function mdCodeForDays(date: string, matchDays: number[]): MdLabel {
  if (matchDays.length === 0) return NO_LABEL;

  const day = toDayNumber(date);
  const prevIdx = lastIndexBelow(matchDays, day);
  const prev = prevIdx >= 0 ? matchDays[prevIdx] : null;
  const atOrAfterIdx = prevIdx + 1;
  const atOrAfter = atOrAfterIdx < matchDays.length ? matchDays[atOrAfterIdx] : null;

  // 경기 당일
  if (atOrAfter === day) {
    return { code: 'MD', daysToNextMatch: 0, daysSincePrevMatch: 0 };
  }

  const next = atOrAfter;
  const sincePrev = prev != null ? day - prev : null;
  const toNext = next != null ? next - day : null;
  const base = { daysToNextMatch: toNext, daysSincePrevMatch: sincePrev };

  // 경기 사이 — 다음 경기에서 거꾸로 먼저 채우고, 남은 날에만 회복일을 붙인다.
  if (prev != null && next != null) {
    const between = next - prev - 1; // 두 경기 사이의 훈련 가능일 수
    // 역산 범위에서 회복일을 예약하지 않는다. 예약하면(between - forward) 7일 간격에서
    // backward 가 4로 묶여 경기 이틀 뒤가 영영 MD-5 가 되지 못한다.
    const backward = Math.min(MAX_BACKWARD, between);
    const forward = Math.max(0, Math.min(MAX_FORWARD, between - 1));

    if (toNext! <= backward) return { ...base, code: `MD-${toNext}` };
    if (sincePrev! <= forward) return { ...base, code: `MD+${sincePrev}` };
    return { ...base, code: null }; // 경기 간격이 길어 주기화 구간 밖인 중간 기간
  }

  // 시즌 마지막 경기 이후 — 회복일만 붙인다.
  if (prev != null) {
    return { ...base, code: sincePrev! <= MAX_FORWARD ? `MD+${sincePrev}` : null };
  }

  // 시즌 첫 경기 이전 — 준비일만 붙인다.
  return { ...base, code: toNext! <= MAX_BACKWARD ? `MD-${toNext}` : null };
}

/**
 * 월요일 시작 주의 번호. 같은 주면 같은 값이다.
 * 1970-01-01 이 목요일이므로 +3 해야 월요일에 경계가 떨어진다.
 */
export function weekKey(iso: string): number {
  return Math.floor((toDayNumber(iso) + 3) / 7);
}

/** 과거·예정 경기일을 합친다. MD 코드는 둘을 구분하지 않는다. */
export function mergeMatchDates(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

/** 날짜 배열에 한 번에 라벨을 붙인다. 경기일 정렬을 한 번만 한다. */
export function mdCodesFor(dates: string[], matchDates: string[]): Map<string, MdLabel> {
  const days = toMatchDays(matchDates);
  return new Map(dates.map(d => [d, mdCodeForDays(d, days)]));
}

/** 리포트 표에서 쓸 정렬 순서 — MD-5 … MD-1, MD, MD+1, MD+2 */
export function mdCodeOrder(code: string | null): number {
  if (code == null) return 99;
  if (code === 'MD') return 0;
  const n = Number(code.slice(3));
  return code[2] === '-' ? -n : n;
}
