import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchRpeData, fetchRpeMaturityPool } from '../lib/api';
import {
  buildRpeScale, MD_COLUMNS, LOAD_AXES, ANNOTATION_AXIS,
  type RpeScaleResult, type LoadAxisKey, type ResponseBin,
} from '../lib/rpeScale';
import { MATURITY_BANDS, bandLabel, type MaturityBandKey } from '../lib/maturity';
import { chartColors, colors } from '../styles/colors';
import type { TeamDailyAggregate } from '../types';

function rpeColor(v: number): string {
  if (v <= 4) return colors.safe;
  if (v <= 6) return colors.warning;
  if (v <= 8) return colors.navy;
  return colors.danger;
}

const fmtM = (v: number) => Math.round(v).toLocaleString();

/**
 * 블록② 성숙도 × MD 격자. 칸마다 세 줄이다 — 소화한 부하 범위 / 그 칸의 평균 RPE / 표본 수.
 * 표본 미달은 빈칸이 아니라 「표본 부족」으로 **왜 비었는지**를 적는다(D2).
 * 지표는 TD 고정이다 — 지표 탭은 U7 이 미결이라 아직 넣지 않는다.
 */
function MaturityMdGrid({ scale }: { scale: RpeScaleResult }) {
  const axis = ANNOTATION_AXIS;
  const playersInBand = new Map(
    MATURITY_BANDS.map(b => [b.key, new Set(scale.rows.filter(r => r.band === b.key).map(r => r.player_id)).size]),
  );

  return (
    <div className="chart-card mb-5">
      <h3 className="text-[18px] font-semibold text-text-primary mb-1">성숙도 × MD 요약</h3>
      <p className="text-[12px] text-text-secondary mb-3">
        훈련만 · 공식 경기일 제외 · 지표는 달린 거리(m). 윗줄은 <strong>소화한 거리의 중앙 50%</strong>,
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
function LoadRpeResponse({ scale }: { scale: RpeScaleResult }) {
  const [axis, setAxis] = useState<LoadAxisKey>(ANNOTATION_AXIS);
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
        훈련만 쓰고 공식 경기일은 뺐습니다.
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

export function RpePage() {
  const [teamTrend, setTeamTrend] = useState<TeamDailyAggregate[]>([]);
  const [playerAvgs, setPlayerAvgs] = useState<{ name: string; avg_rpe: number; sessions: number; player_id: string }[]>([]);
  const [distribution, setDistribution] = useState<number[]>([]);
  const [scale, setScale] = useState<RpeScaleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRpeData().then(d => {
      setTeamTrend(d.teamTrend);
      setPlayerAvgs(d.playerAvgs);
      setDistribution(d.distribution);
      setLoading(false);
    });
    fetchRpeMaturityPool()
      .then(d => setScale(buildRpeScale(d.pool, d.players, d.officialMatchDates)))
      .catch(() => setScale(null));
  }, []);

  if (loading) {
    return <div className="p-8 text-text-secondary text-center">로딩 중...</div>;
  }

  const trendChart = teamTrend.slice(-30).map(d => ({
    date: d.date.slice(5),
    rpe: +d.rpe_mean.toFixed(1),
  }));

  const distChart = distribution.map((count, i) => ({
    label: String(i + 1),
    count,
    color: i < 4 ? 'rgba(0, 140, 126, 0.42)' : i < 6 ? 'rgba(255, 217, 0, 0.50)' : i < 8 ? 'rgba(21, 62, 111, 0.34)' : 'rgba(164, 40, 67, 0.34)',
  }));

  const playerChart = playerAvgs.filter(p => p.avg_rpe > 0).slice(0, 25);

  return (
    <div className="p-6">
      <div className="sec-title">RPE 모니터링</div>

      {scale && <LoadRpeResponse scale={scale} />}
      {scale && <MaturityMdGrid scale={scale} />}

      <div className="grid grid-cols-2 gap-4 mb-5 chart-grid-2">
        <div className="chart-card">
          <div className="chart-title">팀 평균 RPE 추이</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: 'DM Mono' }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11, fontFamily: 'DM Mono' }} />
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
              <Area type="monotone" dataKey="rpe" stroke={chartColors.warning} fill="rgba(255, 217, 0, 0.18)" strokeWidth={2} name="평균 RPE" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">RPE 분포 (전체 기간)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'DM Mono' }} />
              <YAxis tick={{ fontSize: 11, fontFamily: 'DM Mono' }} />
              <Tooltip
                formatter={(v) => [`${v}건`, 'RPE']}
                contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {distChart.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card mb-5">
        <div className="chart-title">선수별 평균 RPE</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={playerChart}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis domain={[0, 10]} tick={{ fontSize: 11, fontFamily: 'DM Mono' }} />
            <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
            <Bar dataKey="avg_rpe" radius={[3, 3, 0, 0]} name="평균 RPE">
              {playerChart.map((entry, i) => (
                <Cell key={i} fill={`${rpeColor(entry.avg_rpe)}80`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <div className="chart-title">선수별 RPE 상세</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>선수</th>
                <th className="right">평균 RPE</th>
                <th className="right">세션수</th>
              </tr>
            </thead>
            <tbody>
              {playerAvgs.filter(p => p.avg_rpe > 0).map(p => (
                <tr key={p.player_id} onClick={() => navigate(`/player/${p.player_id}`)}>
                  <td className="name">{p.name}</td>
                  <td className="num" style={{ color: rpeColor(p.avg_rpe) }}>{p.avg_rpe}</td>
                  <td className="num">{p.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
