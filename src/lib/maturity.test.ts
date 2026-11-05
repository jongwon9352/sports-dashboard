// 성숙도 4구간 판정의 회귀 보호.
//
// 경계가 중요하다. 실측 모집단 3,180행 중 구간 경계(0·1·2년) ±0.15년에 518행(16%)이 걸쳐 있다.
// 부등호가 한 번 뒤집히면 그 518행이 다른 구간으로 간다.
//
// 값은 2026-11-05 실측에 맞췄다: 성숙도 측정일은 전원 2026-07-02~05 한 번뿐이다.

import { describe, it, expect } from 'bun:test';
import {
  MATURITY_BANDS, maturityBandFor, yearsFromPhv, bandForYears, bandLabel,
  isNearBandBoundary, ageAt, type MaturityInput,
} from './maturity';

/** 2013년생 Pre-PHV 선수 (실측 Pre 구간의 전형) */
const PRE: MaturityInput = {
  maturity_offset: -1.2, baseline_measured_at: '2026-07-02', birth_date: '2013-02-13',
};

describe('구간 경계 — 경계값은 위쪽 구간에 속한다', () => {
  it('음수는 Pre-PHV', () => {
    expect(bandForYears(-0.01)).toBe('pre');
    expect(bandForYears(-5)).toBe('pre');
  });

  it('정확히 0 은 PHV+0~1년이다 (Pre 가 아니다)', () => {
    expect(bandForYears(0)).toBe('y01');
  });

  it('정확히 1 은 PHV+1~2년이다', () => {
    expect(bandForYears(1)).toBe('y12');
  });

  it('정확히 2 는 PHV+2년~ 이다', () => {
    expect(bandForYears(2)).toBe('y2p');
  });

  it('구간 안쪽 값들', () => {
    expect(bandForYears(0.99)).toBe('y01');
    expect(bandForYears(1.99)).toBe('y12');
    expect(bandForYears(9)).toBe('y2p');
  });
});

describe('PHV 경과 연수 — 측정일에서 달력을 밀어 추정한다', () => {
  it('측정일 당일은 오프셋 그대로다', () => {
    expect(yearsFromPhv(-0.88, '2026-07-02', '2026-07-02')).toBe(-0.88);
  });

  it('측정일 이후는 늘어난다', () => {
    const y = yearsFromPhv(-0.88, '2026-07-02', '2027-07-02');
    expect(y).toBeCloseTo(0.12, 2); // +365일 ≈ +0.9993년
  });

  it('측정일 이전은 줄어든다 — 과거 세션은 역추정이다', () => {
    const y = yearsFromPhv(-0.88, '2026-07-02', '2026-01-02');
    expect(y).toBeLessThan(-0.88);
    expect(y).toBeCloseTo(-1.3756, 3); // -181일 / 365.25 = -0.49555 → -0.88 - 0.49555
  });

  it('시간대에 흔들리지 않는다 — UTC 일 번호로 계산한다', () => {
    // 같은 날짜 문자열은 실행 시간대와 무관하게 같은 값을 내야 한다.
    expect(yearsFromPhv(0, '2026-03-01', '2026-03-31')).toBeCloseTo(30 / 365.25, 6);
  });
});

describe('판정할 수 없으면 null 이다 — 추정값을 지어내지 않는다', () => {
  it('성숙도 측정이 없으면 null', () => {
    expect(maturityBandFor({ ...PRE, maturity_offset: null }, '2026-06-01')).toBeNull();
  });

  it('측정일이 없으면 null', () => {
    expect(maturityBandFor({ ...PRE, baseline_measured_at: null }, '2026-06-01')).toBeNull();
  });

  it('생년월일이 없으면 null', () => {
    expect(maturityBandFor({ ...PRE, birth_date: null }, '2026-06-01')).toBeNull();
  });

  it('18세 이상이면 null — Mirwald 공식의 유효 범위 밖이다', () => {
    // 2001년생이 실제로 players 에 섞여 있었다(성인 시험 데이터).
    const adult: MaturityInput = {
      maturity_offset: 1.0, baseline_measured_at: '2026-07-02', birth_date: '2001-02-19',
    };
    expect(maturityBandFor(adult, '2026-06-01')).toBeNull();
  });

  it('17세는 판정한다 — 18세 미만이면 유효하다', () => {
    const almost: MaturityInput = {
      maturity_offset: 2.5, baseline_measured_at: '2026-07-02', birth_date: '2009-06-02',
    };
    expect(maturityBandFor(almost, '2026-06-01')).toBe('y2p');
  });
});

describe('실제 선수로 판정', () => {
  it('Pre-PHV 선수는 측정일 기준으로 Pre 다', () => {
    expect(maturityBandFor(PRE, '2026-07-02')).toBe('pre');
  });

  it('같은 선수가 시즌 중 구간을 넘어간다 — 세션 날짜별로 판정해야 하는 이유', () => {
    const borderline: MaturityInput = {
      maturity_offset: -0.1, baseline_measured_at: '2026-07-02', birth_date: '2012-01-01',
    };
    expect(maturityBandFor(borderline, '2026-07-02')).toBe('pre');
    expect(maturityBandFor(borderline, '2026-10-02')).toBe('y01'); // +3개월이면 넘어간다
  });
});

describe('목록이 유일한 출처다 (red flag 8 — 손으로 맞추는 목록 금지)', () => {
  it('네 구간이고 키가 중복되지 않는다', () => {
    expect(MATURITY_BANDS).toHaveLength(4);
    expect(new Set(MATURITY_BANDS.map(b => b.key)).size).toBe(4);
  });

  it('구간이 틈 없이 이어지고 겹치지 않는다', () => {
    for (let i = 1; i < MATURITY_BANDS.length; i++) {
      expect(MATURITY_BANDS[i].lo).toBe(MATURITY_BANDS[i - 1].hi);
    }
    expect(MATURITY_BANDS[0].lo).toBe(-Infinity);
    expect(MATURITY_BANDS[MATURITY_BANDS.length - 1].hi).toBe(Infinity);
  });

  it('색 토큰이 구간마다 다르고 전부 --color-phv- 접두사다', () => {
    const vars = MATURITY_BANDS.map(b => b.colorVar);
    expect(new Set(vars).size).toBe(4);
    expect(vars.every(v => v.startsWith('--color-phv-'))).toBe(true);
  });

  it('라벨이 평문이고 구간마다 다르다 (D25)', () => {
    const labels = MATURITY_BANDS.map(b => bandLabel(b.key));
    expect(new Set(labels).size).toBe(4);
    expect(labels).toEqual(['Pre-PHV', 'PHV+0~1년', 'PHV+1~2년', 'PHV+2년~']);
  });
});

describe('경계 근접 — 측정이 한 번뿐인 한계를 화면에 밝히기 위한 것', () => {
  it('0·1·2 경계 ±0.15 안이면 참이다', () => {
    expect(isNearBandBoundary(0.1)).toBe(true);
    expect(isNearBandBoundary(-0.1)).toBe(true);
    expect(isNearBandBoundary(1.05)).toBe(true);
    expect(isNearBandBoundary(2.14)).toBe(true);
  });

  it('구간 가운데는 거짓이다', () => {
    expect(isNearBandBoundary(0.5)).toBe(false);
    expect(isNearBandBoundary(-1.2)).toBe(false);
    expect(isNearBandBoundary(3)).toBe(false);
  });

  it('-Infinity 경계는 세지 않는다', () => {
    expect(isNearBandBoundary(-1e9)).toBe(false);
  });
});

describe('나이', () => {
  it('생일 전후로 값이 바뀐다', () => {
    expect(ageAt('2013-02-13', '2026-02-12')).toBeLessThan(13);
    expect(ageAt('2013-02-13', '2026-02-14')).toBeGreaterThan(13);
  });
});
