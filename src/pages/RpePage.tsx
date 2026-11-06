import { useEffect, useState } from 'react';
import { fetchRpeMaturityPool } from '../lib/api';
import {
  buildRpeScale, MD_COLUMNS, LOAD_AXES, ANNOTATION_AXIS,
  type RpeScaleResult, type LoadAxisKey, type ResponseBin,
} from '../lib/rpeScale';
import { buildRpeInsights, type RpeInsights } from '../lib/rpeInsights';
import { MATURITY_BANDS, bandLabel, type MaturityBandKey } from '../lib/maturity';

const fmtM = (v: number) => Math.round(v).toLocaleString();

/**
 * 블록① 부하 → RPE 히트맵. **이 화면의 본문이다.**
 *
 * 묻는 것: 같은 거리를 뛰어도 성숙도에 따라 그날 RPE 가 다르게 나오는가.
 *
 * 선 4개를 겹쳐 그리다가 히트맵으로 바꿨다(2026-11-06). 이유는 측정값이다 —
 * 성숙도 구간 간 평균 RPE 차이는 **중앙값 1.3점**인데, 같은 칸 안 개인차는 **3점**이다.
 * 세션 점을 뿌리면 찾으려는 신호보다 노이즈가 커서 1.3점이 회색 안개에 덮인다.
 * 칸 색이면 겹치는 선이 0개라 1.3점이 바로 보인다.
 *   위아래로 훑으면 성숙도 효과 · 좌우로 훑으면 부하 효과.
 * 색은 정밀하게 읽히지 않으므로 **숫자를 칸에 같이 적는다**.
 *
 * MD 를 다섯 판으로 나눈 건 MD 자체가 부하의 성격을 바꾸기 때문이다 — 합치면
 * MD-1 의 가벼운 7km 와 MD-3 의 7km 가 한 칸으로 뭉개진다.
 */
function LoadRpeResponse({ scale, axis, setAxis }: {
  scale: RpeScaleResult;
  axis: LoadAxisKey;
  setAxis: (a: LoadAxisKey) => void;
}) {
  const meta = LOAD_AXES.find(a => a.key === axis)!;

  const panels = MD_COLUMNS.map(md => ({
    md,
    rows: MATURITY_BANDS.map(b => ({
      band: b.key,
      bins: scale.response.find(r => r.band === b.key && r.md === md && r.axis === axis)?.bins ?? [],
    })),
  }));

  // 색 범위는 다섯 판이 공유한다. 판마다 따로 재면 같은 색이 다른 RPE 를 뜻하게 된다.
  const allMeans = panels.flatMap(p => p.rows.flatMap(r => r.bins.map(b => b.rpeMean)))
    .filter((v): v is number => v != null);
  const lo = allMeans.length ? Math.min(...allMeans) : 0;
  const hi = allMeans.length ? Math.max(...allMeans) : 10;

  return (
    <div className="chart-card mb-5">
      <h3 className="text-[18px] font-semibold text-text-primary mb-1">부하에 따라 RPE 가 어떻게 나왔나</h3>
      <p className="text-[12px] text-text-secondary mb-3">
        가로는 {meta.ko}({meta.unit}) 구간, 세로는 성숙도입니다. 칸의 숫자와 색이 <strong>그 조건에서 나온 평균 RPE</strong>입니다.
        K리그주니어가 있는 주의 훈련만 쓰고 공식 경기일은 뺐습니다.
      </p>

      <div className="flex gap-1.5 mb-3" role="tablist" aria-label="지표">
        {LOAD_AXES.map(a => (
          <button
            key={a.key}
            role="tab"
            aria-selected={a.key === axis}
            onClick={() => setAxis(a.key)}
            className={`min-h-[44px] px-4 rounded-sm text-[13px] border ${
              a.key === axis
                ? 'bg-brand text-white border-brand font-semibold'
                : 'bg-surface text-text-secondary border-surface-secondary'
            }`}
          >
            {a.ko}
          </button>
        ))}
      </div>

      <RpeScaleLegend lo={lo} hi={hi} />

      <div className="rpe-heat-row">
        {panels.map(p => (
          <MdHeatPanel key={p.md} md={p.md} rows={p.rows} lo={lo} hi={hi} unit={meta.unit} />
        ))}
      </div>
    </div>
  );
}

// 색 계산은 TS 에서 한다 — 빌드(lightningcss)가 CSS 의 color-mix 를 뭉갠 전례가 있다.
const HEAT_FROM = [238, 243, 241];  // --color-surface-secondary
const HEAT_TO = [164, 40, 67];      // --color-brand

/**
 * 램프의 진한 끝을 0.69 에서 끊는다. **밝기에 따라 글자색을 뒤집지 않기 위해서다.**
 * 뒤집으면 흰 글자와 검은 글자가 둘 다 실패하는 휘도 구간(0.183~0.229)이 생기고,
 * 거기서 대비가 2.27:1 까지 떨어진다 — 칸의 숫자가 정확한 값이므로 읽히지 않으면 안 된다.
 * 0.69 에서 끊으면 가장 진한 칸도 본문 글자 대비 4.54:1 로 AA 를 넘고, 색은 흰 배경 대비
 * 1.12~3.94:1 범위를 유지해 칸끼리는 충분히 구분된다.
 */
const HEAT_MAX_T = 0.69;

function heatColor(t: number): string {
  const k = Math.max(0, Math.min(1, t)) * HEAT_MAX_T;
  const c = HEAT_FROM.map((f, i) => Math.round(f + (HEAT_TO[i] - f) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function RpeScaleLegend({ lo, hi }: { lo: number; hi: number }) {
  const steps = 6;
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[11px] text-neutral">RPE {lo.toFixed(1)}</span>
      <div className="flex" aria-hidden="true">
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className="rpe-heat-swatch" style={{ background: heatColor(i / (steps - 1)) }} />
        ))}
      </div>
      <span className="text-[11px] text-neutral">{hi.toFixed(1)} (힘들었음)</span>
    </div>
  );
}

const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

function MdHeatPanel({ md, rows, lo, hi, unit }: {
  md: string;
  rows: { band: MaturityBandKey; bins: ResponseBin[] }[];
  lo: number; hi: number; unit: string;
}) {
  // 구간 경계는 네 성숙도 행이 공유한다(풀 전체 분위수). 빈 행이 있어도 열 머리글은 나와야 한다.
  const header = rows.find(r => r.bins.length > 0)?.bins ?? [];
  const cols = header.length;
  if (cols === 0) return null;

  return (
    <div className="rpe-heat-panel">
      <div className="chart-title">{md}</div>
      <div className="rpe-heat" style={{ gridTemplateColumns: `78px repeat(${cols}, minmax(0, 1fr))` }}>
        <div className="rpe-heat-corner">{unit}</div>
        {header.map((b, i) => (
          // 마지막 구간은 꼬리가 길다(8.6k~19.2k). 상한을 적으면 19.2k 가 그 열의 대표값처럼
          // 읽히므로 「8.6k 이상」으로 적는다.
          <div key={i} className="rpe-heat-colhead">
            {i === header.length - 1 ? `${fmtK(b.lo)}+` : `≤${fmtK(b.hi)}`}
          </div>
        ))}

        {rows.map(r => [
          <div key={`${r.band}-l`} className="rpe-heat-rowhead">{bandLabel(r.band)}</div>,
          ...Array.from({ length: cols }, (_, i) => {
            const b = r.bins[i];
            if (b == null || b.rpeMean == null) {
              return (
                <div key={`${r.band}-${i}`} className="rpe-heat-cell empty" title={b ? `세션 ${b.n}건 — 표본 부족` : '표본 없음'}>
                  –
                </div>
              );
            }
            const t = hi > lo ? (b.rpeMean - lo) / (hi - lo) : 0.5;
            return (
              <div
                key={`${r.band}-${i}`}
                className="rpe-heat-cell"
                style={{ background: heatColor(t) }}
                title={`${bandLabel(r.band)} · ${md} · ${fmtK(b.lo)}~${fmtK(b.hi)}${unit} · 평균 RPE ${b.rpeMean} · 세션 ${b.n}건`}
              >
                {b.rpeMean.toFixed(1)}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}

/**
 * 맨 위 분석 카드. **문장을 하드코딩하지 않는다** — 숫자가 바뀌면 문장도 바뀌어야 한다.
 * 방향을 단정하는 문장은 `monotonic` 비율을 보고 세기를 바꾼다(rpeInsights 참조).
 */
function RpeAnalysis({ insights, axis }: { insights: RpeInsights; axis: LoadAxisKey }) {
  const i = insights;
  const meta = LOAD_AXES.find(a => a.key === axis)!;

  const mds = i.byMd.filter(m => m.rpeMean != null);
  const hardest = mds.length ? mds.reduce((a, b) => (b.rpeMean! > a.rpeMean! ? b : a)) : null;
  const easiest = mds.length ? mds.reduce((a, b) => (b.rpeMean! < a.rpeMean! ? b : a)) : null;

  // 네 구간이 한 방향으로 정렬된 비교의 비율. 이 값이 문장의 세기를 정한다.
  const monoPct = i.maturity.comparisons > 0
    ? Math.round((i.maturity.monotonic / i.maturity.comparisons) * 100) : null;
  const ordered = monoPct != null && monoPct >= 60;

  const sens = i.sensitivity.filter(s => s.slope != null);
  const sensRising = sens.length >= 2 && sens.every((s, k) => k === 0 || s.slope! >= sens[k - 1].slope!);

  return (
    <div className="chart-card mb-5 rpe-analysis">
      <h3 className="text-[18px] font-semibold text-text-primary mb-1">
        성숙도에 따른 {meta.ko} 스케일별 RPE 분포
      </h3>
      <p className="text-[12px] text-neutral mb-4">
        U15·U14·U13 {i.players}명 · <strong>K리그주니어가 있는 {i.weeks}개 주</strong>의 훈련{' '}
        {i.sessions.toLocaleString()}세션 · {i.from} ~ {i.to} · 공식 경기일 제외 · MD-5~MD-1
        {i.excludedOutsideLeagueWeek > 0 && (
          <> · 울진대회·소년체전·유스챔피언십처럼 2~3일에 한 번 경기한 주는 뺐습니다
            ({i.excludedOutsideLeagueWeek.toLocaleString()}세션)</>
        )}
      </p>

      <ol className="rpe-findings">
        <li>
          <strong>{meta.ko}가 늘면 RPE 도 오른다.</strong>{' '}
          {i.load.risingPct != null ? (
            <>
              성숙도×MD {i.load.cells}칸 가운데 <strong>{i.load.risingPct}%</strong> 에서
              가장 적은 구간보다 가장 많은 구간의 RPE 가 높았고,
              그 차이의 중앙값은 <strong>{i.load.medianDelta}점</strong>입니다.
              {i.load.risingPct === 100
                ? ' 예외가 된 칸이 없습니다.'
                : ` 나머지 ${100 - i.load.risingPct}% 는 반대로 나온 칸입니다.`}
            </>
          ) : '표본이 모자라 아직 말할 수 없습니다.'}
        </li>

        <li>
          {ordered ? (
            <><strong>성숙도가 높을수록 같은 부하를 {i.maturity.medianTopMinusPre! > 0 ? '더' : '덜'} 힘들어했습니다.</strong>{' '}
              같은 부하 구간 {i.maturity.comparisons}번의 비교 중 <strong>{i.maturity.monotonic}번</strong>에서
              네 구간이 성숙도 순서대로 정렬됐습니다.</>
          ) : (
            <><strong>성숙도 자체의 효과는 순서대로 나타나지 않습니다.</strong>{' '}
              같은 부하 구간에서 네 구간을 비교한 {i.maturity.comparisons}번 중 순서가 유지된 건{' '}
              <strong>{i.maturity.monotonic}번({monoPct}%)</strong>뿐입니다.
              {i.maturity.medianTopMinusPre != null && (
                <> 가장 성숙한 구간은 Pre-PHV 보다 평균 <strong>{Math.abs(i.maturity.medianTopMinusPre)}점{' '}
                  {i.maturity.medianTopMinusPre < 0 ? '낮았지만' : '높았지만'}</strong>, 중간 두 구간이
                  그 사이에 순서대로 놓이지 않습니다 — <em>성숙도만으로 RPE 를 예상할 수 없다</em>는 뜻입니다.</>
              )}</>
          )}
        </li>

        <li>
          {sens.length < 2 ? (
            <>
              <strong>부하에 대한 민감도는 이 범위에서 잴 수 없습니다.</strong>{' '}
              같은 선수 안에서 재려면 한 칸에 선수당 세션이 충분해야 하는데, 대회 주간을 빼고 나니
              그 조건을 넘는 칸이 {sens.length}개뿐입니다. 성숙도 효과를 선수 구성과 분리해 말하려면
              이 값이 필요합니다 — <em>지금은 구간 간 평균 차이만 있고, 그건 선수 구성이 섞인 비교입니다.</em>
            </>
          ) : (
          <>
            <strong>
              {sensRising
                ? '다만 부하에 대한 민감도는 성숙도 순으로 커집니다.'
                : '부하에 대한 민감도는 구간마다 다르지만 성숙도 순은 아닙니다.'}
            </strong>{' '}
            같은 선수 안에서 많이 뛴 날과 적게 뛴 날의 RPE 차이를 재면{' '}
            {sens.map((s, k) => (
              <span key={s.band}>
                {k > 0 && ' → '}
                {bandLabel(s.band)} <strong>{s.slope!.toFixed(2)}점</strong>
              </span>
            ))}
            {' '}입니다. 구간끼리의 평균 비교와 달리 <em>선수 구성이 섞이지 않는 비교</em>라서,
            성숙도 효과를 말하려면 이쪽을 봐야 합니다.
          </>
          )}
        </li>

        {hardest && easiest && hardest.md !== easiest.md && (
          <li>
            <strong>MD 가 RPE 를 가장 크게 가릅니다.</strong>{' '}
            가장 힘든 날은 <strong>{hardest.md}(평균 {hardest.rpeMean})</strong>,
            가장 가벼운 날은 <strong>{easiest.md}(평균 {easiest.rpeMean})</strong> 로
            차이가 <strong>{Math.round((hardest.rpeMean! - easiest.rpeMean!) * 100) / 100}점</strong>입니다 —
            성숙도 구간 간 차이보다 큽니다. 주기화 의도대로 요일이 작동하고 있다는 뜻입니다.
          </li>
        )}
      </ol>

      <div className="rpe-caveats">
        <div className="rpe-caveats-title">이 해석을 약하게 만드는 것</div>
        <ul>
          {i.caveats.medianWithinCellSpread != null && (
            <li>
              <strong>
                {i.maturity.medianTopMinusPre != null
                  && i.caveats.medianWithinCellSpread > Math.abs(i.maturity.medianTopMinusPre)
                  ? '개인차가 성숙도 구간 간 차이보다 큽니다.'
                  : '같은 칸 안에서도 개인차가 있습니다.'}
              </strong>{' '}
              한 칸 안에서 RPE 중앙 50% 가 <strong>{i.caveats.medianWithinCellSpread}점</strong> 퍼져 있습니다
              {i.maturity.medianTopMinusPre != null
                && ` (구간 간 차이는 ${Math.abs(i.maturity.medianTopMinusPre)}점)`}.
              칸의 숫자는 평균이지 개인의 예상값이 아닙니다.
            </li>
          )}
          {i.caveats.measuredFrom && (
            <li>
              <strong>성숙도는 {i.caveats.measuredFrom} ~ {i.caveats.measuredTo} 한 번 측정한 값</strong>을
              세션 날짜로 민 추정입니다. 구간 경계 ±0.15년에 {i.caveats.nearBoundary.toLocaleString()}건이 걸쳐 있어,
              그만큼은 옆 구간일 수도 있습니다.
            </li>
          )}
          {i.caveats.thinnestBand && (
            <li>
              <strong>{bandLabel(i.caveats.thinnestBand.band)} 는 {i.caveats.thinnestBand.players}명</strong>뿐입니다.
              그 행은 집단의 경향이라기보다 몇 사람의 기록에 가깝습니다.
            </li>
          )}
          <li>
            연습경기는 훈련으로 세되 <strong>RPE 를 받지 않아</strong> 부하 범위에는 들어가고 RPE 평균에는 빠집니다.
          </li>
        </ul>
      </div>
    </div>
  );
}

/**
 * 블록② 성숙도 × MD 격자. 칸마다 세 줄이다 — 소화한 부하 범위 / 그 칸의 평균 RPE / 표본 수.
 * 표본 미달은 빈칸이 아니라 「표본 부족」으로 **왜 비었는지**를 적는다(D2).
 * 지표는 위 히트맵의 탭을 따른다.
 */
function MaturityMdGrid({ scale, axis }: { scale: RpeScaleResult; axis: LoadAxisKey }) {
  const meta = LOAD_AXES.find(a => a.key === axis)!;
  const playersInBand = new Map(
    MATURITY_BANDS.map(b => [b.key, new Set(scale.rows.filter(r => r.band === b.key).map(r => r.player_id)).size]),
  );

  return (
    <div className="chart-card mb-5">
      <h3 className="text-[18px] font-semibold text-text-primary mb-1">성숙도 × MD 요약</h3>
      <p className="text-[12px] text-text-secondary mb-3">
        K리그주니어 주간의 훈련만 · 공식 경기일 제외 · 지표는 {meta.ko}({meta.unit}). 윗줄은 <strong>소화한 양의 중앙 50%</strong>,
        아랫줄은 <strong>그때 나온 평균 RPE</strong>입니다.
      </p>
      <div className="rpe-grid">
        <div className="rpe-grid-head" style={{ textAlign: 'left' }}>성숙도</div>
        {MD_COLUMNS.map(md => (
          <div key={md} className="rpe-grid-head">
            {md}
          </div>
        ))}

        {MATURITY_BANDS.map(b => {
          const cells = MD_COLUMNS.map(md => scale.grid.find(c => c.band === b.key && c.md === md)!);
          const allSuppressed = cells.every(c => c.suppressed != null && c.rpeSuppressed != null);
          const label = (
            <div key={`${b.key}-label`} className="rpe-grid-rowlabel">
              <span>{bandLabel(b.key)}</span>
              <span className="sub">{playersInBand.get(b.key) ?? 0}명</span>
            </div>
          );
          // 한 행이 통째로 가려지면 같은 문안을 다섯 번 쓰지 않고 한 칸으로 합친다(D-T3).
          if (allSuppressed) {
            const total = cells.reduce((a, c) => a + c.total, 0);
            return [label, (
              <div key={`${b.key}-merged`} className="rpe-grid-cell rpe-grid-merged">
                선수 {playersInBand.get(b.key) ?? 0}명 · 세션 {total}건 — 선수가 3명 미만이라 다섯 칸 모두 숫자를 내지 않습니다.
              </div>
            )];
          }
          return [label, ...cells.map(c => (
            <div key={`${b.key}-${c.md}`} className="rpe-grid-cell">
              {c.suppressed ? (
                <span className="range muted">표본 부족</span>
              ) : (
                <span className="range">{fmtM(c.axes[axis].p25!)}~{fmtM(c.axes[axis].p75!)}</span>
              )}
              {c.rpeSuppressed ? (
                <span className="hit muted">—</span>
              ) : (
                <span className="hit" title={`RPE 중앙 50% ${c.rpeP25}~${c.rpeP75}`}>RPE {c.rpeMean}</span>
              )}
              <span className="n">
                n {c.total}{c.friendly > 0 ? ` (연습경기 ${c.friendly})` : ''}
              </span>
            </div>
          ))];
        })}
      </div>
      {scale.measuredAt && (
        <p className="text-[11px] text-neutral mt-2">
          성숙도는 {scale.measuredAt.from} ~ {scale.measuredAt.to} 측정값을 세션 날짜로 민 추정입니다
          {scale.excluded.nearBoundary > 0 && ` · 구간 경계 ±0.15년에 ${scale.excluded.nearBoundary}건이 걸쳐 있습니다`}.
        </p>
      )}
    </div>
  );
}

export function RpePage() {
  const [scale, setScale] = useState<RpeScaleResult | null>(null);
  const [axis, setAxis] = useState<LoadAxisKey>(ANNOTATION_AXIS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRpeMaturityPool()
      .then(d => setScale(buildRpeScale(d.pool, d.players, d.officialMatchDates, d.leagueMatchDates)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="sec-title">RPE 모니터링</div>
        <div className="chart-card text-[13px] text-text-secondary">
          데이터를 불러오지 못했습니다. 조용히 빈 화면을 보여주지 않으려고 원인을 그대로 적습니다 —
          <span className="font-data"> {error}</span>
        </div>
      </div>
    );
  }

  if (!scale) {
    return (
      <div className="p-6">
        <div className="sec-title">RPE 모니터링</div>
        <div className="p-8 text-text-secondary text-center">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="sec-title">RPE 모니터링</div>
      <RpeAnalysis insights={buildRpeInsights(scale, axis)} axis={axis} />
      <LoadRpeResponse scale={scale} axis={axis} setAxis={setAxis} />
      <MaturityMdGrid scale={scale} axis={axis} />
    </div>
  );
}
