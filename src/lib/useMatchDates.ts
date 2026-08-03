// 경기 일정의 단일 소스. 리포트 화면들이 같은 MD 코드를 쓰도록 여기서 한 번만 받아 공유한다.
// 월간 주기화에서 경기를 등록하면 invalidateMatchDates()로 캐시를 버린다.

import { useEffect, useState } from 'react';
import { fetchAllMatchDates } from './api';

let cached: Promise<string[]> | null = null;

function allMatchDates(): Promise<string[]> {
  cached ??= fetchAllMatchDates().catch(() => []);
  return cached;
}

export function invalidateMatchDates(): void {
  cached = null;
}

export function useMatchDates(): string[] {
  const [dates, setDates] = useState<string[]>([]);
  useEffect(() => { allMatchDates().then(setDates); }, []);
  return dates;
}
