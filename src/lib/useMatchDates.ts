// 경기 일정의 단일 소스. 리포트 화면들이 같은 MD 코드를 쓰도록 여기서 한 번만 받아 공유한다.
// 월간 주기화에서 경기를 등록하면 invalidateMatchDates()로 캐시를 버린다.
//
// 용도가 둘이라 목록도 둘이다. 하나로 합치면 한쪽이 틀린다.
//   useMdAnchorDates() — MD 라벨 계산용. 공식 경기만(연습경기는 훈련이다).
//   useAllMatchDates() — 회복 맥락·표시용. 연습경기 포함(이틀 전 연습경기도 회복에 영향이 있다).

import { useEffect, useState } from 'react';
import { fetchAllMatchDates, fetchMdAnchorDates } from './api';

let cachedAll: Promise<string[]> | null = null;
let cachedAnchors: Promise<string[]> | null = null;

export function invalidateMatchDates(): void {
  cachedAll = null;
  cachedAnchors = null;
}

function useCached(get: () => Promise<string[]>): string[] {
  const [dates, setDates] = useState<string[]>([]);
  useEffect(() => { get().then(setDates); }, [get]);
  return dates;
}

const allMatchDates = () => (cachedAll ??= fetchAllMatchDates().catch(() => []));
const mdAnchorDates = () => (cachedAnchors ??= fetchMdAnchorDates().catch(() => []));

/** MD 라벨 계산용 — 공식 경기만 */
export function useMdAnchorDates(): string[] {
  return useCached(mdAnchorDates);
}

/** 회복 맥락·표시용 — 연습경기 포함 */
export function useAllMatchDates(): string[] {
  return useCached(allMatchDates);
}
