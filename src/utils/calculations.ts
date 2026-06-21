import type { MaturityStatus, AcwrZone } from '../types';

const ACUTE_LAMBDA = 0.25;
const CHRONIC_LAMBDA = 0.069;

export function calculateEwma(
  todayLoad: number,
  prevEwma: number | null,
  lambda: number
): number {
  if (prevEwma === null) return todayLoad;
  return todayLoad * lambda + prevEwma * (1 - lambda);
}

export function calculateAcuteEwma(todayLoad: number, prevAcute: number | null): number {
  return calculateEwma(todayLoad, prevAcute, ACUTE_LAMBDA);
}

export function calculateChronicEwma(todayLoad: number, prevChronic: number | null): number {
  return calculateEwma(todayLoad, prevChronic, CHRONIC_LAMBDA);
}

export function calculateAcwr(acute: number, chronic: number): number {
  if (acute <= 0 || chronic <= 0) return 0;
  return acute / chronic;
}

export function calculateDailyTrainingLoad(durationMin: number, rpe: number): number {
  return durationMin * rpe;
}

interface AcwrThresholds {
  greenUpper: number;
  yellowUpper: number;
}

function getThresholds(maturity: MaturityStatus): AcwrThresholds {
  switch (maturity) {
    case 'Post': return { greenUpper: 1.3, yellowUpper: 1.5 };
    case 'Pre': return { greenUpper: 1.2, yellowUpper: 1.4 };
    case 'Mid': return { greenUpper: 1.1, yellowUpper: 1.3 };
  }
}

export function getAcwrZone(
  acwr: number,
  dataSufficient: boolean,
  maturity: MaturityStatus
): AcwrZone {
  if (!dataSufficient) return 'insufficient';
  const { greenUpper, yellowUpper } = getThresholds(maturity);
  if (acwr < 0.8) return 'caution';
  if (acwr <= greenUpper) return 'safe';
  if (acwr <= yellowUpper) return 'caution';
  return 'danger';
}

export function getZoneColor(zone: AcwrZone): string {
  switch (zone) {
    case 'safe': return '#008C7E';
    case 'caution': return '#B08A00';
    case 'danger': return '#A42843';
    case 'insufficient': return '#66717A';
  }
}

export function getZoneLabel(zone: AcwrZone): string {
  switch (zone) {
    case 'safe': return '안전';
    case 'caution': return '주의';
    case 'danger': return '위험';
    case 'insufficient': return '데이터 부족';
  }
}

export function calculateMonotony(dailyLoads: number[]): number {
  if (dailyLoads.length < 2) return 0;
  const mean = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length;
  const variance = dailyLoads.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (dailyLoads.length - 1);
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return 0;
  return mean / stdev;
}

export function getAsymmetryPercent(left: number, right: number): number {
  const max = Math.max(left, right);
  if (max === 0) return 0;
  return Math.abs(left - right) / max * 100;
}
