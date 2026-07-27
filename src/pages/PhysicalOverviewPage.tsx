import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, ReferenceLine, ReferenceArea, Legend,
  ComposedChart, Scatter, Area, Line,
} from 'recharts';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  fetchAllPlayers, fetchPhysicalTestRecords, fetchMaturityRecords, fetchSpeedCustomRecords, fetchValdThresholds,
  fetchBodyCompositionRecords, computeValdValue,
  VALD_METRIC_DEFS, VALD_GRADES, VALD_ACCESSORS,
  type PhysicalTestRow, type MaturityRow, type SpeedCustomRow, type ValdThreshold, type BodyCompositionRow,
} from '../lib/api';
import type { Player, Grade } from '../types';
import { colors, chartColors } from '../styles/colors';

// 좌우 차이 % — VALD 표준: (큰 쪽 - 작은 쪽) / 큰 쪽 * 100, 부호는 R 기준
function imbalancePercent(l: number, r: number): number {
  const base = Math.max(l, r);
  return base > 0 ? ((r - l) / base) * 100 : 0;
}

interface ValdItem { name: string; L: number | null; R: number | null; value: number; imbalance: number | null }

// entries의 records가 1개(특정 차수 선택)면 그 기록을, 여러 개(전체 선택)면 항목별 최고 기록을 사용
function buildValdItems(metricKey: string, invert: boolean | undefined, entries: { name: string; records: PhysicalTestRow[] }[]): ValdItem[] {
  const acc = VALD_ACCESSORS[metricKey];
  const items: ValdItem[] = [];
  for (const { name, records } of entries) {
    let best: PhysicalTestRow | null = null;
    let bestVal: number | null = null;
    for (const r of records) {
      const v = computeValdValue(metricKey, r);
      if (v == null) continue;
      if (bestVal == null || (invert ? v < bestVal : v > bestVal)) { bestVal = v; best = r; }
    }
    if (!best) continue;
    if (acc.value) {
      const v = acc.value(best);
      if (v != null) items.push({ name, L: null, R: null, value: v, imbalance: null });
    } else if (acc.left && acc.right) {
      const l = acc.left(best);
      const r = acc.right(best);
      if (l != null && r != null) items.push({ name, L: l, R: r, value: (l + r) / 2, imbalance: imbalancePercent(l, r) });
      else if (l != null || r != null) items.push({ name, L: l, R: r, value: (l ?? r)!, imbalance: null });
    }
  }
  return items;
}

function imbalanceZone(pct: number | null): 'safe' | 'caution' | 'danger' | null {
  if (pct == null) return null;
  const abs = Math.abs(pct);
  if (abs >= 10) return 'danger';
  if (abs >= 5) return 'caution';
  return 'safe';
}

const TIER_COLORS = [colors.warning, colors.green, colors.navy];
function tierIndexOf(value: number, tiers: { max: number; label: string }[]): number {
  for (let i = 0; i < tiers.length; i++) if (value <= tiers[i].max) return i;
  return tiers.length - 1;
}

// 팀 임계값(최저~최대) 범위를 벗어난 개인 기록을 색으로 강조 — 범위 안은 기본색 유지
function outOfRange(value: number, threshold: ValdThreshold | null): boolean {
  if (!threshold) return false;
  if (threshold.max_value != null && value > threshold.max_value) return true;
  if (threshold.min_value != null && value < threshold.min_value) return true;
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ValdDot({ cx, cy, payload, threshold }: any) {
  if (cx == null || cy == null) return null;
  const fill = outOfRange(payload.value, threshold) ? colors.warning : colors.navy;
  return <circle cx={cx} cy={cy} r={5} fill={fill} stroke="#fff" strokeWidth={1.5} />;
}

function ValdMetricSection({ metricKey, label, unit, invert, hasLR, note, tiers, dotPlot, entries, threshold, sectionRef, selectable, checked, onToggle }: {
  metricKey: string; label: string; unit: string; invert?: boolean; hasLR?: boolean; note?: string;
  tiers?: { max: number; label: string }[]; dotPlot?: boolean;
  entries: { name: string; records: PhysicalTestRow[] }[]; threshold: ValdThreshold | null;
  sectionRef?: (el: HTMLDivElement | null) => void; selectable?: boolean; checked?: boolean; onToggle?: () => void;
}) {
  const items = useMemo(() => buildValdItems(metricKey, invert, entries), [metricKey, invert, entries]);
  // 구간(tiers)이 있는 항목(예: EUR)은 오름차순, 닷플롯 항목(스프린트 등)은 기록 좋은 순으로 정렬
  const displayItems = useMemo(() => {
    if (tiers) return [...items].sort((a, b) => a.value - b.value);
    if (dotPlot) return [...items].sort((a, b) => invert ? a.value - b.value : b.value - a.value);
    return items;
  }, [items, tiers, dotPlot, invert]);
  const top10 = useMemo(
    () => [...items].sort((a, b) => invert ? a.value - b.value : b.value - a.value).slice(0, 10),
    [items, invert],
  );
  const riskPlayers = useMemo(
    () => items.filter(i => (imbalanceZone(i.imbalance) === 'danger')),
    [items],
  );

  if (items.length === 0) {
    return (
      <div className="mb-5" ref={sectionRef}>
        <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2 flex items-center gap-2" style={{ fontFamily: 'var(--font-data)' }}>
          {selectable && (
            <input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 accent-cyan-500" />
          )}
          {label}
        </p>
        <p className="text-sm text-text-disabled text-center py-8 bg-surface rounded-xl border border-surface-secondary">데이터 없음</p>
      </div>
    );
  }

  return (
    <div className="mb-5" ref={sectionRef}>
      <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2 flex items-center gap-2" style={{ fontFamily: 'var(--font-data)' }}>
        {selectable && (
          <input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 accent-cyan-500" />
        )}
        {label}{unit ? ` (${unit})` : ''} · {items.length}명
      </p>
      {note && (
        <div className="rounded-lg border px-3 py-2 mb-3 text-xs" style={{ background: '#eff6ff', borderColor: '#93c5fd', color: '#1e3a8a' }}>
          {note}
        </div>
      )}
      {threshold && (threshold.max_value != null || threshold.avg_value != null || threshold.min_value != null) && (
        <div className="flex gap-4 flex-wrap items-center mb-2 text-xs font-medium">
          {threshold.max_value != null && (
            <span className="flex items-center gap-1.5" style={{ color: colors.green }}>
              <span className="w-3 h-0.5 inline-block" style={{ background: colors.green }} /> 최대 {threshold.max_value}{unit}
            </span>
          )}
          {threshold.avg_value != null && (
            <span className="flex items-center gap-1.5" style={{ color: colors.navy }}>
              <span className="w-3 h-0.5 inline-block" style={{ background: colors.navy }} /> 평균 {threshold.avg_value}{unit}
            </span>
          )}
          {threshold.min_value != null && (
            <span className="flex items-center gap-1.5" style={{ color: colors.wine }}>
              <span className="w-3 h-0.5 inline-block" style={{ background: colors.wine }} /> 최저 {threshold.min_value}{unit}
            </span>
          )}
          {!tiers && (threshold.min_value != null || threshold.max_value != null) && (
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: colors.warning }} /> 범위 이탈 기록
            </span>
          )}
        </div>
      )}
      <div className="bg-surface rounded-xl border border-surface-secondary p-3.5 mb-3">
        {dotPlot ? (
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(600, displayItems.length * 32) }}>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={displayItems} margin={{ bottom: 80 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="name" interval={0} angle={-60} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                  <YAxis type="number" unit={unit} tick={{ fontSize: 10 }} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(3)}${unit}`} />
                  {threshold?.min_value != null && threshold?.max_value != null && (
                    <ReferenceArea y1={threshold.min_value} y2={threshold.max_value} fill={colors.green} fillOpacity={0.1} />
                  )}
                  {threshold?.avg_value != null && (
                    <ReferenceLine y={threshold.avg_value} stroke={colors.navy} strokeWidth={1.5} strokeDasharray="5 3" />
                  )}
                  <Scatter dataKey="value" shape={<ValdDot threshold={threshold} />} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={displayItems} margin={{ bottom: 80 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="name" interval={0} angle={-60} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit={unit} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any, n: any) => [`${v}${unit}`, n]} />
              {hasLR && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {threshold?.min_value != null && threshold?.max_value != null && (
                <ReferenceArea y1={threshold.min_value} y2={threshold.max_value} fill={colors.green} fillOpacity={0.08} />
              )}
              {threshold?.max_value != null && (
                <ReferenceLine y={threshold.max_value} stroke={colors.green} strokeWidth={1.5} strokeDasharray="5 3" />
              )}
              {threshold?.avg_value != null && (
                <ReferenceLine y={threshold.avg_value} stroke={colors.navy} strokeWidth={1.5} strokeDasharray="5 3" />
              )}
              {threshold?.min_value != null && (
                <ReferenceLine y={threshold.min_value} stroke={colors.wine} strokeWidth={1.5} strokeDasharray="5 3" />
              )}
              {hasLR ? (
                <>
                  <Bar dataKey="L" name="Left" fill={colors.navy} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="R" name="Right" fill={colors.green} radius={[2, 2, 0, 0]} />
                </>
              ) : tiers ? (
                <Bar dataKey="value" name={label} radius={[2, 2, 0, 0]}>
                  {displayItems.map((d, i) => (
                    <Cell key={i} fill={TIER_COLORS[tierIndexOf(d.value, tiers)]} />
                  ))}
                </Bar>
              ) : (
                <Bar dataKey="value" name={label} radius={[2, 2, 0, 0]}>
                  {displayItems.map((d, i) => (
                    <Cell key={i} fill={outOfRange(d.value, threshold) ? colors.warning : colors.navy} />
                  ))}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
        {tiers && (
          <div className="flex gap-4 mt-2 flex-wrap justify-center text-[11px] text-text-secondary">
            {tiers.map((t, i) => (
              <span key={t.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: TIER_COLORS[i] }} />
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {hasLR && riskPlayers.length > 0 && (
        <div className="rounded-lg border px-3 py-2 mb-3 text-xs" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
          좌우 불균형 10% 이상(부상 위험 높음): {riskPlayers.map(p => `${p.name} ${p.imbalance!.toFixed(1)}%`).join(', ')}
        </div>
      )}

      <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>{label} Top 10</p>
      <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={top10} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid stroke={colors.grid} horizontal={false} />
            <XAxis type="number" unit={unit} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={(v: any) => `${Number(v).toFixed(2)}${unit}`} />
            <Bar dataKey="value" fill={colors.green} radius={[0, 3, 3, 0]}>
              {top10.map((_, i) => <Cell key={i} fillOpacity={1 - i * 0.06} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── VALD 종합 분석 / 운동 처방 인사이트 (현재 탭·차수 필터 기준) ─────────
// 참고자료: VALD "2024/25 Premier League Report"(NordBord/ForceFrame/ForceDecks 규범 데이터),
// Chumanov et al. (2007, J Biomech) — 내전근이 스윙기 대퇴이두근 스트레치를 줄이는 역할("제4의 햄스트링"),
// Bourne et al. (2020, BJSM) — 고관절 내전/외전 좌우 불균형과 서혜부 부상 위험의 연관성
interface ValdInsightData {
  n: number;
  lrStats: Record<string, { n: number; avg: number; dangerPlayers: { name: string; pct: number }[] }>;
  eurTiers: { label: string; count: number }[];
  eurTotal: number;
  compoundImbalance: { name: string; labels: string[] }[];
  nordicVsIso: { name: string; nordic: number; iso: number }[];
  adductorNordicRisk: { name: string; hipAdd: number; nordic: number }[];
  belowMin: Record<string, string[]>;
}

const LR_METRIC_KEYS = ['nordic_curl', 'hip_abduction', 'hip_adduction', 'ham_iso'] as const;
const INSIGHT_ITEMS = [
  { key: 'insight_analysis', label: 'VALD 종합 분석' },
  { key: 'insight_prescription', label: '운동 처방 인사이트' },
];
const FLAT_METRIC_KEYS = ['cmj_height', 'cmj_peak_force', 'squat_jump_height', 'squat_jump_peak_force', 'sprint_5m', 'sprint_10m', 'sprint_30m', 'cod_run', 'cod_ball'];

function computeValdInsight(entries: { name: string; records: PhysicalTestRow[] }[], thresholds: ValdThreshold[], grade: string): ValdInsightData {
  const byMetric = new Map<string, ValdItem[]>();
  for (const m of VALD_METRIC_DEFS) byMetric.set(m.key, buildValdItems(m.key, m.invert, entries));
  const thresholdFor = (key: string) => thresholds.find(t => t.metric_key === key && t.grade === grade) ?? null;

  const lrStats: ValdInsightData['lrStats'] = {};
  const imbalanceCount = new Map<string, string[]>();
  for (const key of LR_METRIC_KEYS) {
    const items = byMetric.get(key) ?? [];
    const n = items.length;
    const avg = n ? items.reduce((s, i) => s + i.value, 0) / n : 0;
    const dangerPlayers = items.filter(i => imbalanceZone(i.imbalance) === 'danger').map(i => ({ name: i.name, pct: i.imbalance! }));
    lrStats[key] = { n, avg, dangerPlayers };
    const label = VALD_METRIC_DEFS.find(m => m.key === key)!.label;
    for (const p of dangerPlayers) {
      if (!imbalanceCount.has(p.name)) imbalanceCount.set(p.name, []);
      imbalanceCount.get(p.name)!.push(label);
    }
  }
  const compoundImbalance = [...imbalanceCount.entries()].filter(([, labels]) => labels.length >= 2).map(([name, labels]) => ({ name, labels }));

  const nordicList = byMetric.get('nordic_curl') ?? [];
  const isoList = byMetric.get('ham_iso') ?? [];
  const nordicMap = new Map(nordicList.map(i => [i.name, i.value]));
  const nordicVsIso: ValdInsightData['nordicVsIso'] = [];
  for (const i of isoList) {
    const nordic = nordicMap.get(i.name);
    if (nordic != null && i.value > nordic) nordicVsIso.push({ name: i.name, nordic, iso: i.value });
  }

  const hipAddList = byMetric.get('hip_adduction') ?? [];
  const avgHipAdd = hipAddList.length ? hipAddList.reduce((s, i) => s + i.value, 0) / hipAddList.length : 0;
  const avgNordic = nordicList.length ? nordicList.reduce((s, i) => s + i.value, 0) / nordicList.length : 0;
  const nordicByName = new Map(nordicList.map(i => [i.name, i.value]));
  const adductorNordicRisk: ValdInsightData['adductorNordicRisk'] = [];
  for (const i of hipAddList) {
    const nordic = nordicByName.get(i.name);
    if (nordic != null && i.value < avgHipAdd && nordic < avgNordic) adductorNordicRisk.push({ name: i.name, hipAdd: i.value, nordic });
  }

  const eurDef = VALD_METRIC_DEFS.find(m => m.key === 'eur')!;
  const eurItems = byMetric.get('eur') ?? [];
  const eurTiers = eurDef.tiers!.map((t, idx) => ({ label: t.label, count: eurItems.filter(i => tierIndexOf(i.value, eurDef.tiers!) === idx).length }));

  const belowMin: Record<string, string[]> = {};
  for (const key of FLAT_METRIC_KEYS) {
    const th = thresholdFor(key);
    const items = byMetric.get(key) ?? [];
    belowMin[key] = th?.min_value != null ? items.filter(i => i.value < th.min_value!).map(i => i.name) : [];
  }

  return { n: entries.length, lrStats, eurTiers, eurTotal: eurItems.length, compoundImbalance, nordicVsIso, adductorNordicRisk, belowMin };
}

// 코치가 바로 이해할 수 있도록 검사명 옆에 붙이는 쉬운 설명
const METRIC_PLAIN_LABEL: Record<string, string> = {
  nordic_curl: 'Nordic Curl (뒷허벅지 당기는 힘)',
  hip_abduction: 'Hip Abduction (엉덩이 바깥쪽 힘)',
  hip_adduction: 'Hip Adduction (허벅지 안쪽 힘)',
  ham_iso: 'Hamstring Iso Prone (뒷허벅지 버티는 힘)',
};

// PDF 캡처(html2canvas)는 CSS Grid를 안정적으로 지원하지 않아, 부모 컨테이너를 flex로 두고
// 각 카드에 고정 비율 basis를 줘서 캡처 시에도 항상 가로로 나열되도록 한다.
function InsightStatCard({ label, count, unit, desc, color }: { label: string; count: number; unit: string; desc: string; color: string }) {
  return (
    <div className="rounded-lg border border-surface-secondary p-2.5" style={{ borderLeft: `3px solid ${color}`, flex: '1 1 200px' }}>
      <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ fontFamily: 'var(--font-data)', color }}>{count}<span className="text-xs font-normal text-text-secondary">{unit}</span></p>
      <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{desc}</p>
    </div>
  );
}

function ValdAnalysisInsightBox({ data, grade, round, sectionRef, selectable, checked, onToggle }: {
  data: ValdInsightData; grade: string; round: string;
  sectionRef?: (el: HTMLDivElement | null) => void; selectable?: boolean; checked?: boolean; onToggle?: () => void;
}) {
  if (data.n === 0) return null;
  const imbalancedMetrics = LR_METRIC_KEYS
    .map(key => ({ key, label: METRIC_PLAIN_LABEL[key], ...data.lrStats[key] }))
    .filter(s => s.dangerPlayers.length > 0);
  const belowMinEntries = FLAT_METRIC_KEYS
    .map(key => ({ key, label: VALD_METRIC_DEFS.find(m => m.key === key)!.label, names: data.belowMin[key] ?? [] }))
    .filter(e => e.names.length > 0);
  const belowMinPlayerCount = new Set(belowMinEntries.flatMap(e => e.names)).size;
  const [eurLow, eurMid, eurHigh] = data.eurTiers.map(t => t.count);

  return (
    <div className="bg-surface rounded-xl border border-surface-secondary p-4 mb-4" ref={sectionRef}>
      <p className="text-sm font-medium mb-2.5 flex items-center gap-2">
        {selectable && <input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 accent-cyan-500" />}
        VALD 종합 분석 <span className="text-xs font-normal text-text-secondary">({grade} · {round === '전체' ? '전체(개인 최고 기록)' : `${round}차`} · {data.n}명)</span>
      </p>

      <p className="text-[13px] leading-relaxed text-text-secondary mb-3">
        VALD 측정 장비로 잰 근력·순발력 검사 결과를 팀 기준(학년 평균)과 비교해, 지도자가 바로 챙겨야 할 선수와 훈련 방향을 정리했습니다.
      </p>

      <div className="flex flex-wrap gap-2.5 mb-3.5">
        <InsightStatCard label="양쪽 힘 차이 큰 선수" count={data.compoundImbalance.length} unit="명" color={colors.wine}
          desc="여러 검사에서 좌우 힘 차이가 10% 이상 — 부상 위험 우선 관리" />
        <InsightStatCard label="햄스트링 부상 위험군" count={data.adductorNordicRisk.length} unit="명" color={colors.navy}
          desc="허벅지 안쪽 힘 + 뒷허벅지 힘이 모두 평균 이하" />
        <InsightStatCard label="검사 결과 재확인 필요" count={data.nordicVsIso.length} unit="명" color={colors.warning}
          desc="뒷허벅지 검사 두 종류의 결과가 반대로 나옴" />
        <InsightStatCard label="기준 미달 항목 있는 선수" count={belowMinPlayerCount} unit="명" color={colors.muted}
          desc="점프·스프린트 등에서 학년 최저 기준보다 낮음" />
      </div>

      {data.compoundImbalance.length > 0 && (
        <div className="rounded-lg border px-3 py-2 mb-2.5 text-xs" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
          <b>양쪽 힘 차이가 큰 선수(2개 항목 이상, 우선 관리):</b>{' '}
          {data.compoundImbalance.map(p => `${p.name}(${p.labels.map(l => METRIC_PLAIN_LABEL[VALD_METRIC_DEFS.find(m => m.label === l)?.key ?? ''] ?? l).join(', ')})`).join('; ')}
        </div>
      )}

      {imbalancedMetrics.length > 0 && (
        <div className="mb-2.5">
          <p className="text-xs font-medium mb-1">검사별 좌우 힘 차이 10% 이상인 선수</p>
          <div className="flex flex-col gap-1">
            {imbalancedMetrics.map(s => (
              <p key={s.key} className="text-xs text-text-secondary leading-relaxed">
                <b className="text-[var(--text)]">{s.label}</b>: {s.dangerPlayers.map(p => `${p.name} ${p.pct.toFixed(1)}%`).join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {data.nordicVsIso.length > 0 && (
        <div className="rounded-lg border px-3 py-2 mb-2.5 text-xs" style={{ background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>
          <b>햄스트링 검사 결과 재확인 필요:</b> {data.nordicVsIso.map(p => p.name).join(', ')}.
          {' '}보통은 당기는 힘(Nordic)이 버티는 힘(ISO Prone)보다 커야 하는데 반대로 나왔습니다. 측정 자세가 부정확했거나, 컨디션 저하·근육 억제가 원인일 수 있으니 재측정을 권장합니다.
        </div>
      )}

      {data.adductorNordicRisk.length > 0 && (
        <div className="rounded-lg border px-3 py-2 mb-2.5 text-xs" style={{ background: '#eff6ff', borderColor: '#93c5fd', color: '#1e3a8a' }}>
          <b>햄스트링 부상 위험군(허벅지 안쪽 힘 + 뒷허벅지 힘 모두 약함):</b> {data.adductorNordicRisk.map(p => p.name).join(', ')}.
          {' '}허벅지 안쪽 근육은 달릴 때 뒷허벅지가 과하게 늘어나는 것을 막아주는 역할을 하는데, 두 곳이 함께 약하면 햄스트링 부상 위험이 커질 수 있습니다.
        </div>
      )}

      {data.eurTotal > 0 && (
        <div className="mb-2.5">
          <p className="text-xs font-medium mb-1">점프할 때 힘 쓰는 방식 분포 · {data.eurTotal}명</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            순간적으로 튀어 오르는 유형(순발력형) <b>{eurLow}명</b> · 적정 비율 <b>{eurMid}명</b> · 힘으로 버티는 유형(근력형) <b>{eurHigh}명</b>
          </p>
        </div>
      )}

      {belowMinEntries.length > 0 && (
        <div className="mb-1">
          <p className="text-xs font-medium mb-1">학년 최저 기준보다 낮게 측정된 항목</p>
          <div className="flex flex-col gap-1">
            {belowMinEntries.map(e => (
              <p key={e.key} className="text-xs text-text-secondary leading-relaxed">
                <b className="text-[var(--text)]">{e.label}</b>: {e.names.join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-disabled mt-2.5 leading-relaxed">
        참고자료: VALD &ldquo;2024/25 Premier League Report&rdquo;(NordBord·ForceFrame·ForceDecks 규범 데이터, 성인 프로 기준이라 절대값 비교보다 해석 참고용) ·
        Chumanov et al. (2007) J Biomech — 내전근의 햄스트링 스트레치 완충 역할 ·
        Bourne et al. (2020) Br J Sports Med — 고관절 내전/외전 좌우 불균형과 서혜부 부상 위험
      </p>
    </div>
  );
}

const EXERCISE_LIBRARY: Record<string, { name: string; detail: string }[]> = {
  imbalance: [
    { name: '단측(편측) Nordic Curl', detail: '3세트 x 6-8회, 약한 쪽부터 좌우 번갈아 · 좌우 불균형 교정' },
    { name: '단측 힙 쓰러스트', detail: '3세트 x 10회, 약한 쪽 우선 실시 · 고관절 신전근 좌우 균형' },
  ],
  nordicVsIso: [
    { name: 'Nordic Curl 자세 교정 재측정', detail: '코칭 큐(엉덩이-무릎-어깨 일직선) 후 재검사, 필요 시 보조 밴드로 난이도 조절' },
    { name: '햄스트링 등척성 유지(ISO Hold)', detail: '3세트 x 20-30초, 통증·신경억제 여부 모니터링' },
  ],
  adductorNordic: [
    { name: 'Copenhagen Adduction (장경간)', detail: '3세트 x 8-10회 좌우 · 내전근 강화, 햄스트링 부상 예방' },
    { name: 'Nordic Curl', detail: '3세트 x 6-8회 · 편심성 햄스트링 근력 동시 보강' },
  ],
  eurLow: [
    { name: '반응성 플라이오메트릭(Depth Jump 등)', detail: '3-4세트 x 5회 · 폭발적 힘 발휘 능력(EUR) 향상' },
  ],
  eurHigh: [
    { name: '최대근력 스쿼트/스티프레그 데드리프트', detail: '4-5세트 x 3-5회, 고강도(≥85%1RM) · 최대근력 기반 훈련' },
  ],
  sprintPower: [
    { name: '가속 스프린트 + 저항 스프린트(썰매)', detail: '4-6회 x 10-20m · 가속력·스프린트 파워 향상' },
  ],
};

function ValdPrescriptionInsightBox({ data, grade, round, sectionRef, selectable, checked, onToggle }: {
  data: ValdInsightData; grade: string; round: string;
  sectionRef?: (el: HTMLDivElement | null) => void; selectable?: boolean; checked?: boolean; onToggle?: () => void;
}) {
  if (data.n === 0) return null;
  const eurLowCount = data.eurTiers[0]?.count ?? 0;
  const eurHighCount = data.eurTiers[2]?.count ?? 0;
  const sprintFlags = ['sprint_5m', 'sprint_10m', 'sprint_30m'].flatMap(k => data.belowMin[k] ?? []);
  const sprintFlagNames = [...new Set(sprintFlags)];

  const focusGroups: { title: string; reason: string; color: string; players: string; exercises: { name: string; detail: string }[] }[] = [];
  if (data.compoundImbalance.length > 0) {
    focusGroups.push({
      title: '좌우 힘 차이 교정', reason: '여러 검사에서 좌우 힘 차이가 큰 선수 — 부상 예방을 위해 약한 쪽부터 우선 보강',
      color: colors.wine, players: data.compoundImbalance.map(p => p.name).join(', '), exercises: EXERCISE_LIBRARY.imbalance,
    });
  }
  if (data.nordicVsIso.length > 0) {
    focusGroups.push({
      title: '햄스트링 검사 재점검', reason: '검사 결과가 반대로 나온 선수 — 자세를 교정해 다시 측정',
      color: colors.warning, players: data.nordicVsIso.map(p => p.name).join(', '), exercises: EXERCISE_LIBRARY.nordicVsIso,
    });
  }
  if (data.adductorNordicRisk.length > 0) {
    focusGroups.push({
      title: '햄스트링 부상 예방 보강', reason: '허벅지 안쪽 힘 + 뒷허벅지 힘이 함께 약한 선수 — 두 부위를 같이 강화',
      color: colors.navy, players: data.adductorNordicRisk.map(p => p.name).join(', '), exercises: EXERCISE_LIBRARY.adductorNordic,
    });
  }
  if (sprintFlagNames.length > 0) {
    focusGroups.push({
      title: '스프린트 파워 향상', reason: '단거리 스프린트 기록이 학년 최저 기준보다 낮은 선수',
      color: colors.green, players: sprintFlagNames.join(', '), exercises: EXERCISE_LIBRARY.sprintPower,
    });
  }

  return (
    <div className="bg-surface rounded-xl border border-surface-secondary p-4 mb-4" ref={sectionRef}>
      <p className="text-sm font-medium mb-2.5 flex items-center gap-2">
        {selectable && <input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5 accent-cyan-500" />}
        운동 처방 인사이트 <span className="text-xs font-normal text-text-secondary">({grade} · {round === '전체' ? '전체(개인 최고 기록)' : `${round}차`})</span>
      </p>

      <p className="text-[13px] leading-relaxed text-text-secondary mb-3">
        위 &ldquo;VALD 종합 분석&rdquo;에서 발견된 문제점별로 바로 훈련에 적용할 수 있는 보강 운동을 정리했습니다.
      </p>

      {focusGroups.length === 0 ? (
        <p className="text-[13px] text-text-secondary">현재 필터 기준 특별히 우선 개입이 필요한 항목이 발견되지 않았습니다. 기존 훈련 강도를 유지하세요.</p>
      ) : (
        <div className="flex flex-col gap-2.5 mb-3">
          {focusGroups.map(g => (
            <div key={g.title} className="bg-bg p-2.5" style={{ borderLeft: `3px solid ${g.color}` }}>
              <div className="flex justify-between items-baseline mb-0.5 flex-wrap gap-x-3">
                <span className="text-xs font-medium">{g.title}</span>
                <span className="text-[11px] text-text-disabled">{g.players}</span>
              </div>
              <p className="text-[11px] text-text-secondary mb-1.5">{g.reason}</p>
              <ul className="text-[11.5px] text-text-secondary leading-relaxed pl-3.5" style={{ listStyle: 'disc' }}>
                {g.exercises.map(ex => <li key={ex.name}><b className="text-[var(--text)]">{ex.name}</b> — {ex.detail}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-surface-secondary pt-2.5">
        <p className="text-xs font-medium mb-1.5">팀 전체 점프 훈련 방향</p>
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {eurLowCount > 0 && <>순간적으로 튀어 오르는 유형(순발력형) <b>{eurLowCount}명</b>은 반응성 점프(플라이오메트릭) 훈련 비중을 늘려주세요. </>}
          {eurHighCount > 0 && <>힘으로 버티는 유형(근력형) <b>{eurHighCount}명</b>은 무거운 중량의 근력 훈련 비중을 늘려주세요. </>}
          {eurLowCount === 0 && eurHighCount === 0 && '현재 대부분 선수가 적정 훈련 비율 구간에 있어 특별한 조정이 필요하지 않습니다.'}
        </p>
      </div>

      <p className="text-[11px] text-text-disabled mt-2.5 leading-relaxed">
        참고자료: VALD &ldquo;2024/25 Premier League Report&rdquo; · Chumanov et al. (2007) J Biomech · Bourne et al. (2020) Br J Sports Med.
        본 처방은 일반적 가이드라인이며, 개인별 통증·병력이 있는 경우 전문 트레이너·의료진과 상의해 조정하세요.
      </p>
    </div>
  );
}

const STAGE_COLOR: Record<string, string> = {
  '성장 급증기 전': colors.navy,
  '성장 급증기': colors.green,
  '성장 급증기 후': colors.wine,
};
const STAGE_ORDER = ['성장 급증기 전', '성장 급증기', '성장 급증기 후'];
const GRADE_ORDER = ['1학년', '2학년', '3학년'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeightOverlayBar(props: any) {
  const { x, y, width, height, payload } = props;
  if (!height) return null;
  const predicted = payload?.predicted_adult_height_cm ?? 0;
  const current = payload?.baseline_height_cm ?? 0;
  if (!predicted) return null;
  const scale = height / predicted;
  const currentH = Math.min(height, current > 0 ? current * scale : 0);
  const baseY = y + height;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill="transparent" stroke={colors.navy} strokeWidth={2} rx={3} />
      <rect x={x + 2} y={baseY - currentH} width={width - 4} height={currentH} fill={colors.navy} rx={2} />
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeightTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-surface-secondary)', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: 'var(--shadow-2)' }}>
      <div style={{ fontWeight: 500, marginBottom: 2 }}>{d.player_name}</div>
      <div>현재 키: {d.baseline_height_cm} cm</div>
      <div>예측 최대 키: {d.predicted_adult_height_cm} cm</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StageTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-surface-secondary)', borderRadius: 6, padding: '6px 10px', fontSize: 12, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-2)' }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{d.stage} ({d.count}명)</div>
      {d.players.map((p: { name: string; offset: number }) => (
        <div key={p.name}>{p.name}: {p.offset > 0 ? '+' : ''}{p.offset}년</div>
      ))}
    </div>
  );
}

const STAGE_TRAINING_FOCUS: Record<string, string[]> = {
  '성장 급증기 전': ['기본 움직임(FMS) 숙달', '신경계 기반 근력·스피드', '민첩성 기초 훈련'],
  '성장 급증기': ['근력 발달 지속', '착지·코어 안정화 훈련', '협응력 저하 모니터링'],
  '성장 급증기 후': ['근비대·파워 훈련 도입', '종목 특화 기술(SSS) 비중 확대', '고강도 저항 훈련 가능'],
};
const MATURITY_OUTLIER_THRESHOLD = 1.0; // 학년 평균 대비 PHV Offset 편차(년) 기준

function MaturityInsightBox({ data, players }: { data: MaturityRow[]; players: Player[] }) {
  const gradeMap = useMemo(() => new Map(players.map(p => [p.id, p.grade])), [players]);

  const stageCounts = useMemo(() => {
    const total = data.length;
    return STAGE_ORDER.map(stage => {
      const count = data.filter(r => r.maturity_stage === stage).length;
      return { stage, count, pct: total ? Math.round((count / total) * 100) : 0 };
    });
  }, [data]);

  const outliers = useMemo(() => {
    const byGrade = new Map<string, number[]>();
    data.forEach(r => {
      const grade = gradeMap.get(r.player_id);
      if (!grade || r.mirwald_maturity_offset == null) return;
      if (!byGrade.has(grade)) byGrade.set(grade, []);
      byGrade.get(grade)!.push(r.mirwald_maturity_offset);
    });
    const gradeAvg = new Map<string, number>();
    byGrade.forEach((vals, grade) => gradeAvg.set(grade, vals.reduce((a, b) => a + b, 0) / vals.length));

    return data
      .map(r => {
        const grade = gradeMap.get(r.player_id);
        if (!grade || r.mirwald_maturity_offset == null) return null;
        const diff = r.mirwald_maturity_offset - (gradeAvg.get(grade) ?? 0);
        return { name: r.player_name, grade, diff };
      })
      .filter((x): x is { name: string; grade: Grade; diff: number } => x != null && Math.abs(x.diff) >= MATURITY_OUTLIER_THRESHOLD)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 4);
  }, [data, gradeMap]);

  if (data.length === 0) return null;

  const [preS, circaS, postS] = stageCounts;

  return (
    <div className="bg-surface rounded-xl border border-surface-secondary p-4">
      <p className="text-sm font-medium mb-2.5">성장 단계 인사이트</p>
      <p className="text-[13px] leading-relaxed text-text-secondary mb-3.5">
        스쿼드 {data.length}명 중 <span style={{ color: colors.navy, fontWeight: 500 }}>{preS.pct}%({preS.count}명)</span>가 급증기 전,{' '}
        <span style={{ color: colors.green, fontWeight: 500 }}>{circaS.pct}%({circaS.count}명)</span>가 급증기,{' '}
        <span style={{ color: colors.wine, fontWeight: 500 }}>{postS.pct}%({postS.count}명)</span>가 급증기 후입니다.
        급증기 구간 선수는 사지 성장으로 일시적 협응력 저하가 나타날 수 있어 기술 훈련 난이도 조절이 필요합니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3.5">
        {STAGE_ORDER.map(stage => {
          const s = stageCounts.find(x => x.stage === stage)!;
          return (
            <div key={stage} className="bg-bg p-2.5" style={{ borderLeft: `3px solid ${STAGE_COLOR[stage]}` }}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs font-medium">{stage}</span>
                <span className="text-[11px] text-text-disabled">{s.count}명</span>
              </div>
              <ul className="text-[11.5px] text-text-secondary leading-relaxed pl-3.5" style={{ listStyle: 'disc' }}>
                {STAGE_TRAINING_FOCUS[stage].map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          );
        })}
      </div>

      {outliers.length > 0 && (
        <div className="border-t border-surface-secondary pt-3">
          <p className="text-xs font-medium mb-2">개인별 주의 선수</p>
          <div className="flex flex-col gap-1.5">
            {outliers.map(o => {
              const early = o.diff > 0;
              const badgeColor = early ? colors.wine : colors.navy;
              return (
                <div key={o.name} className="flex items-start gap-2">
                  <span
                    className="flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded"
                    style={{ background: `${badgeColor}1a`, color: badgeColor }}
                  >
                    {early ? '조숙' : '만숙'}
                  </span>
                  <span className="text-xs leading-relaxed">
                    <span className="font-medium">{o.name}</span>({o.grade}) · 학년 평균보다 {Math.abs(o.diff).toFixed(1)}년{' '}
                    {early ? '빠른 성장 진행. 학년 대비 높은 훈련 강도 적용을 고려하세요.' : '느린 성장 진행. 근비대보다 신경계 기반 근력·스피드·민첩성에 집중하세요.'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-text-disabled mt-2.5">
            최종 성인 키는 조숙·만숙 여부와 무관합니다. 생활 나이가 아닌 개인별 생물학적 성숙도 기준으로 훈련 강도를 조정하세요.
          </p>
        </div>
      )}
    </div>
  );
}

function MaturityCharts({ rows, players }: { rows: MaturityRow[]; players: Player[] }) {
  const data = useMemo(() => {
    return rows
      .filter(r => r.predicted_adult_height_cm != null && r.mirwald_aphv_age != null && r.pah_percent != null)
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [rows]);

  const stageData = useMemo(() => {
    return STAGE_ORDER.map(stage => {
      const players = data.filter(r => r.maturity_stage === stage);
      return {
        stage,
        count: players.length,
        players: players.map(p => ({ name: p.player_name, offset: p.mirwald_maturity_offset ?? 0 })),
      };
    }).filter(s => s.count > 0);
  }, [data]);

  const gradeStageData = useMemo(() => {
    const gradeMap = new Map(players.map(p => [p.id, p.grade]));
    return GRADE_ORDER.map(grade => {
      const inGrade = data.filter(r => gradeMap.get(r.player_id) === grade);
      const row: Record<string, string | number> = { grade };
      STAGE_ORDER.forEach(stage => {
        row[stage] = inGrade.filter(r => r.maturity_stage === stage).length;
      });
      return row;
    }).filter(row => STAGE_ORDER.some(stage => Number(row[stage]) > 0));
  }, [data, players]);

  if (data.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-16">신체 성숙도 계산에 필요한 데이터(신장/앉은키/부모 신장 등)가 입력된 선수가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <MaturityInsightBox data={data} players={players} />

      <div>
        <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
          선수별 현재 키 · 최대 성장 키 예측(Khamis-Roche)
        </p>
        <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
          <div className="flex items-center justify-center gap-4 mb-2 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: colors.navy }} /> 현재 키(채움)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block border-2" style={{ borderColor: colors.navy }} /> 예측 최대 키(테두리)
            </span>
          </div>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={data} margin={{ bottom: 70 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="player_name" interval={0} angle={-60} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
              <YAxis unit="cm" tick={{ fontSize: 11 }} />
              <Tooltip content={<HeightTooltip />} />
              <Bar dataKey="predicted_adult_height_cm" shape={HeightOverlayBar} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
          선수별 PHV(성장 급증 정점) 예측 나이
        </p>
        <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={data} margin={{ bottom: 70 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="player_name" interval={0} angle={-60} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
              <YAxis unit="세" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, _n, p) => [`${v}세`, p?.payload?.maturity_stage]} />
              <Bar dataKey="mirwald_aphv_age" name="APHV(세)" radius={[3, 3, 0, 0]}>
                {data.map(r => (
                  <Cell key={r.player_id} fill={STAGE_COLOR[r.maturity_stage ?? ''] ?? colors.muted} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-[11px] text-text-secondary">
            {Object.entries(STAGE_COLOR).map(([stage, color]) => (
              <span key={stage} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                {stage}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
            성장 단계 비율
          </p>
          <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stageData}
                  dataKey="count"
                  nameKey="stage"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={(p: any) => `${p.stage} ${((p.percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {stageData.map(s => (
                    <Cell key={s.stage} fill={STAGE_COLOR[s.stage] ?? colors.muted} />
                  ))}
                </Pie>
                <Tooltip content={<StageTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
            학년별 성장 단계 분포
          </p>
          <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={gradeStageData} margin={{ top: 10 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `${v}명`} />
                {STAGE_ORDER.map(stage => (
                  <Bar key={stage} dataKey={stage} stackId="a" fill={STAGE_COLOR[stage]} name={stage} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 text-[11px] text-text-secondary justify-center">
              {Object.entries(STAGE_COLOR).map(([stage, color]) => (
                <span key={stage} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                  {stage}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type GroupMode = '전체' | '학년' | '포지션' | '성숙도';
const GROUP_MODES: GroupMode[] = ['전체', '학년', '포지션', '성숙도'];
const POSITION_ORDER = ['GK', 'CB', 'FB', 'MF', 'WF', 'CF'];

function groupKey(mode: GroupMode, r: SpeedCustomRow, gradeMap: Map<string, string>, stageMap: Map<string, string | null>): string | null {
  if (mode === '학년') return gradeMap.get(r.player_id) ?? null;
  if (mode === '포지션') return r.position;
  if (mode === '성숙도') return stageMap.get(r.player_id) ?? null;
  return null;
}

function SpeedMetricChart({ data, dataKey, unit, color, avg }: { data: SpeedCustomRow[]; dataKey: 'mas' | 'mss'; unit: string; color: string; avg: number }) {
  const sorted = useMemo(() => [...data].sort((a, b) => b[dataKey] - a[dataKey]), [data, dataKey]);

  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart data={sorted} margin={{ bottom: 70 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis dataKey="player_name" interval={0} angle={-60} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
        <YAxis unit={unit} tick={{ fontSize: 11 }} domain={['dataMin - 1', 'dataMax + 1']} />
        <Tooltip formatter={v => `${v} ${unit}`} />
        <ReferenceLine y={avg} stroke={color} strokeDasharray="4 3" strokeWidth={1.5}
          label={{ value: `평균 ${avg.toFixed(1)}${unit}`, position: 'insideTopRight', fontSize: 11, fill: color }} />
        <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const MAS_TIERS: { label: string; max: number }[] = [
  { label: '매우 낮음', max: 11.5 },
  { label: '낮음', max: 12.5 },
  { label: '보통', max: 13.5 },
  { label: '우수', max: 15.0 },
  { label: '매우 우수', max: 16.5 },
  { label: '엘리트', max: Infinity },
];

function classifyMAS(v: number): string {
  return (MAS_TIERS.find(t => v <= t.max) ?? MAS_TIERS[MAS_TIERS.length - 1]).label;
}

function SpeedInsightBox({ rows, gradeMap, stageMap }: { rows: SpeedCustomRow[]; gradeMap: Map<string, string>; stageMap: Map<string, string | null> }) {
  const masInsight = useMemo(() => {
    const tierCounts = new Map<string, number>();
    rows.forEach(r => tierCounts.set(classifyMAS(r.mas), (tierCounts.get(classifyMAS(r.mas)) ?? 0) + 1));
    const elite = tierCounts.get('엘리트') ?? 0;
    const low = rows.filter(r => r.mas < 15.0).sort((a, b) => a.mas - b.mas).slice(0, 2);
    return { tierCounts, elite, low };
  }, [rows]);

  const mssStageInsight = useMemo(() => {
    const byStage = new Map<string, number[]>();
    rows.forEach(r => {
      const stage = stageMap.get(r.player_id);
      if (!stage) return;
      if (!byStage.has(stage)) byStage.set(stage, []);
      byStage.get(stage)!.push(r.mss);
    });
    const avgByStage = STAGE_ORDER.map(stage => {
      const vals = byStage.get(stage) ?? [];
      return { stage, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, count: vals.length };
    });
    const postAvg = avgByStage.find(s => s.stage === '성장 급증기 후')?.avg ?? null;
    const lagging = postAvg != null
      ? rows.filter(r => stageMap.get(r.player_id) === '성장 급증기 후' && r.mss < postAvg)
          .sort((a, b) => a.mss - b.mss).slice(0, 2)
      : [];
    return { avgByStage, lagging };
  }, [rows, stageMap]);

  if (rows.length === 0) return null;

  const total = rows.length;
  const elitePct = Math.round((masInsight.elite / total) * 100);

  const attentionPlayers = [
    ...masInsight.low.map(r => ({ key: `mas-${r.player_id}`, badge: 'MAS 낮음', color: colors.wine,
      text: `${r.player_name}(${gradeMap.get(r.player_id) ?? ''}) · ${r.mas}km/h — 저학년일수록 발달 여지가 있어 고학년부터 우선순위를 정하세요.` })),
    ...mssStageInsight.lagging.map(r => ({ key: `mss-${r.player_id}`, badge: 'MSS 정체', color: colors.navy,
      text: `${r.player_name} · ${r.mss}km/h — 급증기 후 단계 평균보다 낮아 스프린트 훈련 비중을 늘려볼 만합니다.` })),
  ];

  return (
    <div className="bg-surface rounded-xl border border-surface-secondary p-4">
      <p className="text-sm font-medium mb-2.5">MAS · MSS 인사이트</p>

      <p className="text-[13px] leading-relaxed text-text-secondary mb-3.5">
        전체 {total}명 중 <span style={{ color: colors.navy, fontWeight: 500 }}>{elitePct}%({masInsight.elite}명)</span>가 MAS 엘리트(≥17km/h) 등급이며,
        MSS는 성장 단계가 진행될수록 함께 증가하는 양상입니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3.5">
        {mssStageInsight.avgByStage.filter(s => s.avg != null).map(s => (
          <div key={s.stage} className="bg-bg p-2.5" style={{ borderLeft: `3px solid ${STAGE_COLOR[s.stage]}` }}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-medium">{s.stage}</span>
              <span className="text-[11px] text-text-disabled">{s.count}명</span>
            </div>
            <p className="text-lg font-medium">{s.avg!.toFixed(1)}<span className="text-[11px] font-normal text-text-disabled"> km/h MSS 평균</span></p>
          </div>
        ))}
      </div>

      {attentionPlayers.length > 0 && (
        <div className="border-t border-surface-secondary pt-3">
          <p className="text-xs font-medium mb-2">개인별 주의 선수</p>
          <div className="flex flex-col gap-1.5">
            {attentionPlayers.map(p => (
              <div key={p.key} className="flex items-start gap-2">
                <span className="flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded" style={{ background: `${p.color}1a`, color: p.color }}>
                  {p.badge}
                </span>
                <span className="text-xs leading-relaxed">{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-disabled mt-2.5">
        출처: 개인화 속도 존 방법론(Individualized Speed Zones, Soccer) · 청소년 스프린트-성숙도 연구. 논문 MSS는 레이더/타이밍 게이트 측정치라 본 데이터(GPS 순간 최고속도)와 절대값 비교 대신 팀 내부 추세 중심으로 구성했습니다.
      </p>
    </div>
  );
}

function SpeedCustomCharts({ rows, players, maturityRows }: { rows: SpeedCustomRow[]; players: Player[]; maturityRows: MaturityRow[] }) {
  const [mode, setMode] = useState<GroupMode>('전체');
  const [subValue, setSubValue] = useState<string>('');

  const gradeMap = useMemo(() => new Map(players.map(p => [p.id, p.grade as string])), [players]);
  const stageMap = useMemo(() => new Map(maturityRows.map(r => [r.player_id, r.maturity_stage])), [maturityRows]);

  const subOptions = useMemo(() => {
    if (mode === '학년') return GRADE_ORDER.filter(g => rows.some(r => gradeMap.get(r.player_id) === g));
    if (mode === '포지션') return POSITION_ORDER.filter(pos => rows.some(r => r.position === pos));
    if (mode === '성숙도') return STAGE_ORDER.filter(s => rows.some(r => stageMap.get(r.player_id) === s));
    return [];
  }, [mode, rows, gradeMap, stageMap]);

  const activeSubValue = subOptions.includes(subValue) ? subValue : (subOptions[0] ?? '');

  const filtered = useMemo(() => {
    if (mode === '전체') return rows;
    return rows.filter(r => groupKey(mode, r, gradeMap, stageMap) === activeSubValue);
  }, [mode, activeSubValue, rows, gradeMap, stageMap]);

  const masAvg = filtered.length ? filtered.reduce((s, r) => s + r.mas, 0) / filtered.length : 0;
  const mssAvg = filtered.length ? filtered.reduce((s, r) => s + r.mss, 0) / filtered.length : 0;

  const groupTabBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded border transition-colors ${
        active ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
      }`}
    >
      {label}
    </button>
  );

  if (rows.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-16">MAS/MSS 데이터가 입력된 선수가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <SpeedInsightBox rows={rows} gradeMap={gradeMap} stageMap={stageMap} />

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {GROUP_MODES.map(m => groupTabBtn(m, mode === m, () => setMode(m)))}
        </div>
        {mode !== '전체' && (
          <div className="flex gap-2 flex-wrap">
            {subOptions.map(v => groupTabBtn(v, activeSubValue === v, () => setSubValue(v)))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-16">해당 그룹에 데이터가 없습니다.</p>
      ) : (
        <>
          <div>
            <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
              MAS (Vameval Test) · {filtered.length}명
            </p>
            <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
              <SpeedMetricChart data={filtered} dataKey="mas" unit="km/h" color={colors.green} avg={masAvg} />
            </div>
          </div>

          <div>
            <p className="text-xs text-text-disabled uppercase tracking-[1px] mb-2" style={{ fontFamily: 'var(--font-data)' }}>
              MSS (40m Sprint Test) · {filtered.length}명
            </p>
            <div className="bg-surface rounded-xl border border-surface-secondary p-3.5">
              <SpeedMetricChart data={filtered} dataKey="mss" unit="km/h" color={colors.navy} avg={mssAvg} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Body composition (팀 전체 월별 신장·체중·BMI 모니터링) ──────────────
function bodyBmi(height: number | null, weight: number | null): number | null {
  if (height == null || weight == null || height <= 0) return null;
  return +(weight / ((height / 100) ** 2)).toFixed(1);
}

// BMI가 10 미만/45 초과면 구글 시트 자유 형식 파싱이 잘못됐을 가능성이 높은 이상치로 간주
function isBmiOutlier(bmi: number | null): boolean {
  return bmi != null && (bmi < 10 || bmi > 45);
}

function BodyStat({ label, unit, digits, cur, prev }: {
  label: string; unit: string; digits: number;
  cur: { avg: number; n: number } | null; prev: { avg: number } | null;
}) {
  if (!cur) return null;
  const delta = prev ? +(cur.avg - prev.avg).toFixed(digits) : null;
  const dir = delta == null ? 'flat' : delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : 'flat';
  const dirColor = dir === 'up' ? colors.safe : dir === 'down' ? colors.danger : 'var(--text-secondary)';
  const sign = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
  return (
    <div className="rounded-lg border border-surface-secondary p-3">
      <p className="text-[10px] text-text-disabled uppercase tracking-[1px]" style={{ fontFamily: 'var(--font-data)' }}>{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-data)' }}>{cur.avg.toFixed(digits)}{unit}</span>
        {delta != null && (
          <span className="text-xs font-medium" style={{ color: dirColor, fontFamily: 'var(--font-data)' }}>
            {sign}{Math.abs(delta).toFixed(digits)}{unit}
          </span>
        )}
      </div>
      <p className="text-[11px] text-text-secondary mt-0.5">전월 대비 · 측정 {cur.n}명</p>
    </div>
  );
}

function BodySparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const w = 150, h = 32;
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...pts.map(p => p.v));
  const max = Math.max(...pts.map(p => p.v));
  const rangeX = (pts[pts.length - 1].i - pts[0].i) || 1;
  const coords = pts.map(p => {
    const px = ((p.i - pts[0].i) / rangeX) * (w - 6) + 3;
    const py = max === min ? h / 2 : h - 4 - ((p.v - min) / (max - min)) * (h - 8);
    return [px, py] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const areaPath = `${path} L${last[0].toFixed(1)},${h} L${coords[0][0].toFixed(1)},${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
    </svg>
  );
}

function BodyCompositionCharts({ rows }: { rows: BodyCompositionRow[] }) {
  const [search, setSearch] = useState('');
  const [trendMetric, setTrendMetric] = useState<'h' | 'w' | 'b'>('h');

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) set.add(`${row.year}-${row.month}`);
    return [...set]
      .map(key => { const [year, month] = key.split('-').map(Number); return { year, month, key }; })
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }, [rows]);

  const byPlayer = useMemo(() => {
    const map = new Map<string, { player_name: string; jersey_number: number | null; cells: Map<string, { height: number | null; weight: number | null }> }>();
    for (const row of rows) {
      if (!map.has(row.player_id)) {
        map.set(row.player_id, { player_name: row.player_name, jersey_number: row.jersey_number, cells: new Map() });
      }
      map.get(row.player_id)!.cells.set(`${row.year}-${row.month}`, { height: row.height, weight: row.weight });
    }
    return [...map.entries()]
      .filter(([, p]) => !search || p.player_name.toLowerCase().includes(search.toLowerCase()))
      .sort(([, a], [, b]) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  }, [rows, search]);

  const monthlyStats = useMemo(() => {
    return months.map(m => {
      const heights: number[] = [], weights: number[] = [], bmis: number[] = [];
      for (const row of rows) {
        if (`${row.year}-${row.month}` !== m.key) continue;
        if (row.height != null) heights.push(row.height);
        if (row.weight != null) weights.push(row.weight);
        const b = bodyBmi(row.height, row.weight);
        if (b != null) bmis.push(b);
      }
      const stat = (arr: number[]) => arr.length ? { avg: arr.reduce((a, b) => a + b, 0) / arr.length, min: Math.min(...arr), max: Math.max(...arr), n: arr.length } : null;
      return { ...m, h: stat(heights), w: stat(weights), b: stat(bmis) };
    });
  }, [months, rows]);

  const trendChartData = monthlyStats.map(s => {
    const st = s[trendMetric];
    return { month: `${s.month}월`, min: st?.min ?? null, range: st ? +(st.max - st.min).toFixed(2) : null, avg: st ? +st.avg.toFixed(trendMetric === 'b' ? 2 : 1) : null };
  });
  const TREND_LABEL = { h: '신장(cm)', w: '체중(kg)', b: 'BMI' } as const;

  const outliers = useMemo(() => {
    return rows
      .map(row => ({ row, bmi: bodyBmi(row.height, row.weight) }))
      .filter(x => isBmiOutlier(x.bmi))
      .sort((a, b) => a.row.player_name.localeCompare(b.row.player_name));
  }, [rows]);

  const leaderboard = useMemo(() => {
    if (months.length < 2) return [];
    const lastKey = months[months.length - 1].key, prevKey = months[months.length - 2].key;
    return byPlayer
      .map(([id, p]) => {
        const from = p.cells.get(prevKey)?.weight ?? null;
        const to = p.cells.get(lastKey)?.weight ?? null;
        if (from == null || to == null) return null;
        return { id, name: p.player_name, delta: +(to - from).toFixed(2), from, to };
      })
      .filter((x): x is { id: string; name: string; delta: number; from: number; to: number } => x != null)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
  }, [byPlayer, months]);
  const maxLeaderboardDelta = Math.max(...leaderboard.map(r => r.delta), 0.1);

  if (months.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-16">데이터가 없습니다. 데이터 관리 &gt; 피지컬 데이터에서 동기화해주세요.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 stat-grid-4">
        <BodyStat label={`평균 신장 (${monthlyStats[monthlyStats.length - 1].month}월)`} unit="cm" digits={1}
          cur={monthlyStats[monthlyStats.length - 1].h} prev={monthlyStats[monthlyStats.length - 2]?.h ?? null} />
        <BodyStat label={`평균 체중 (${monthlyStats[monthlyStats.length - 1].month}월)`} unit="kg" digits={1}
          cur={monthlyStats[monthlyStats.length - 1].w} prev={monthlyStats[monthlyStats.length - 2]?.w ?? null} />
        <BodyStat label={`평균 BMI (${monthlyStats[monthlyStats.length - 1].month}월)`} unit="" digits={2}
          cur={monthlyStats[monthlyStats.length - 1].b} prev={monthlyStats[monthlyStats.length - 2]?.b ?? null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        <div className="chart-card">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div className="chart-title !mb-0">팀 성장 추이</div>
            <div className="flex gap-1 p-0.5 rounded-lg bg-surface-secondary">
              {(['h', 'w', 'b'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setTrendMetric(m)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${trendMetric === m ? 'bg-surface font-semibold' : 'text-text-secondary'}`}
                >
                  {TREND_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-text-secondary mb-2">팀 평균 {TREND_LABEL[trendMetric]} 추이 · 음영은 최저~최고 구간</p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={40} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} formatter={(v: any, key: any) => key === 'avg' ? [v, '팀 평균'] : [v, key]} />
              <Area type="monotone" dataKey="min" stackId="band" stroke="none" fill="transparent" />
              <Area type="monotone" dataKey="range" stackId="band" stroke="none" fill={chartColors.grid} fillOpacity={0.9} name="최저~최고" />
              <Line type="monotone" dataKey="avg" stroke={colors.navy} strokeWidth={2.5} dot={{ r: 3 }} name="팀 평균" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">데이터 이상치 <span className="text-text-secondary font-normal text-xs">({outliers.length}건)</span></div>
          <p className="text-[11px] text-text-secondary mb-2">셀 값이 자동 파싱 범위를 벗어나 확인이 필요한 항목 (BMI 10 미만 또는 45 초과)</p>
          {outliers.length === 0 ? (
            <p className="text-sm text-text-secondary py-2">✅ 이상 없음</p>
          ) : (
            <div className="space-y-2 max-h-[170px] overflow-y-auto">
              {outliers.map((o, i) => (
                <div key={i} className="rounded-lg p-2.5 bg-red-50 border border-red-200">
                  <p className="text-xs font-bold">{o.row.player_name} · {o.row.year}.{o.row.month}월</p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    신장 {o.row.height ?? '—'}cm · 체중 {o.row.weight ?? '—'}kg → BMI {o.bmi} — 시트에서 단위 구분 후 재확인 필요
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {leaderboard.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">
            이달의 변화 TOP 5 <span className="text-text-secondary font-normal text-xs">({months[months.length - 2].month}월 → {months[months.length - 1].month}월, 체중 증가량 기준)</span>
          </div>
          <div className="space-y-2 mt-2">
            {leaderboard.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="w-5 text-text-secondary text-xs" style={{ fontFamily: 'var(--font-data)' }}>{i + 1}</span>
                <span className="w-20 text-sm font-medium truncate">{r.name}</span>
                <span className="w-28 text-sm font-semibold" style={{ color: colors.safe, fontFamily: 'var(--font-data)' }}>+{r.delta}kg</span>
                <span className="w-28 text-xs text-text-secondary" style={{ fontFamily: 'var(--font-data)' }}>{r.from.toFixed(1)} → {r.to.toFixed(1)}kg</span>
                <div className="flex-1 h-1.5 rounded bg-surface-secondary overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(r.delta / maxLeaderboardDelta) * 100}%`, background: colors.safe }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-xs font-bold text-text-secondary uppercase tracking-wide">선수별 추이 ({byPlayer.length}명)</div>
          <input
            type="text"
            placeholder="이름 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400 w-[140px]"
            style={{ fontFamily: 'var(--font-data)' }}
          />
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {byPlayer.map(([playerId, p]) => {
            const heights = months.map(m => p.cells.get(m.key)?.height ?? null);
            const weights = months.map(m => p.cells.get(m.key)?.weight ?? null);
            const lastHeight = [...heights].reverse().find(v => v != null) ?? null;
            const lastWeight = [...weights].reverse().find(v => v != null) ?? null;
            const flagged = outliers.some(o => o.row.player_id === playerId);
            return (
              <div key={playerId} className={`rounded-lg border p-2.5 ${flagged ? 'border-red-300' : 'border-surface-secondary'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{p.player_name}</span>
                  {flagged && <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">확인필요</span>}
                </div>
                <div className="flex gap-3 text-[11px] text-text-secondary mt-1">
                  <span>키 <b className="text-[var(--text)]">{lastHeight ?? '—'}</b>cm</span>
                  <span>체중 <b className="text-[var(--text)]">{lastWeight ?? '—'}</b>kg</span>
                </div>
                <BodySparkline values={heights} color={colors.navy} />
                <BodySparkline values={weights} color={colors.wine} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Tab = 'vald' | 'body' | 'speed' | 'maturity';

export function PhysicalOverviewPage() {
  const [tab, setTab] = useState<Tab>('vald');
  const [players, setPlayers] = useState<Player[]>([]);
  const [allRecords, setAllRecords] = useState<PhysicalTestRow[]>([]);
  const [maturityRows, setMaturityRows] = useState<MaturityRow[]>([]);
  const [speedCustomRows, setSpeedCustomRows] = useState<SpeedCustomRow[]>([]);
  const [thresholds, setThresholds] = useState<ValdThreshold[]>([]);
  const [bodyRows, setBodyRows] = useState<BodyCompositionRow[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>(VALD_GRADES[0]);
  const [loading, setLoading] = useState(true);
  const ALL_ROUNDS = '전체';
  const [roundFilter, setRoundFilter] = useState<string>(ALL_ROUNDS);
  const [pdfSelectMode, setPdfSelectMode] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [pdfExporting, setPdfExporting] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    Promise.all([fetchAllPlayers(), fetchPhysicalTestRecords(), fetchMaturityRecords(), fetchSpeedCustomRecords(), fetchValdThresholds(), fetchBodyCompositionRecords()])
      .then(([p, records, maturity, speed, th, body]) => {
        setPlayers(p);
        setAllRecords(records);
        setMaturityRows(maturity);
        setSpeedCustomRows(speed);
        setThresholds(th);
        setBodyRows(body);
        setLoading(false);
      });
  }, []);

  // 차수(test_round) 목록: 최신순, "전체"(개인 최고 기록) 포함
  const roundOptions = useMemo(() => {
    const rounds = [...new Set(allRecords.map(r => r.test_round).filter((r): r is string => r != null))];
    rounds.sort((a, b) => b.localeCompare(a));
    return [ALL_ROUNDS, ...rounds];
  }, [allRecords]);

  const playerRecordsMap = useMemo(() => {
    const map = new Map<string, PhysicalTestRow[]>();
    for (const r of allRecords) {
      if (!map.has(r.player_id)) map.set(r.player_id, []);
      map.get(r.player_id)!.push(r);
    }
    return map;
  }, [allRecords]);

  // VALD 팀 비교: 학년 필터 + 차수 필터(전체 선택 시 선수별 전 차수 기록 모두 전달 → 항목별 최고 기록 사용)
  const valdEntries = useMemo(() => {
    const gradeMap = new Map(players.map(p => [p.id, p.grade as string]));
    return players
      .filter(p => gradeFilter === '전체' || gradeMap.get(p.id) === gradeFilter)
      .map(p => {
        const all = playerRecordsMap.get(p.id) ?? [];
        const records = roundFilter === ALL_ROUNDS ? all : all.filter(r => r.test_round === roundFilter);
        return { name: p.name, records };
      })
      .filter(e => e.records.length > 0);
  }, [players, gradeFilter, playerRecordsMap, roundFilter]);

  const valdInsight = useMemo(() => computeValdInsight(valdEntries, thresholds, gradeFilter), [valdEntries, thresholds, gradeFilter]);

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const startPdfSelect = () => {
    setSelectedMetrics(new Set([...INSIGHT_ITEMS.map(i => i.key), ...VALD_METRIC_DEFS.map(m => m.key)]));
    setPdfSelectMode(true);
  };

  const handleValdPdfExport = useCallback(async () => {
    const metrics = [...INSIGHT_ITEMS, ...VALD_METRIC_DEFS].filter(m => selectedMetrics.has(m.key));
    if (metrics.length === 0) return;
    setPdfExporting(true);
    try {
      const pdfW = 210, pdfH = 297;
      const pages: { imgData: string; aspect: number }[] = [];
      const failedLabels: string[] = [];

      for (const metric of metrics) {
        const el = sectionRefs.current[metric.key];
        if (!el) continue;

        // 캡처 전 요소 폭을 강제로 바꾸면 Recharts 차트가 두 번(축소·복원) 재렌더링되어
        // 항목이 많을 때 누적 지연으로 일부 캡처가 시간 내에 끝나지 못했다.
        // 화면에 이미 그려진 크기 그대로 캡처해 불필요한 재렌더링을 없앤다.
        const checkbox = el.querySelector('input[type=checkbox]') as HTMLElement | null;
        const origCheckboxDisplay = checkbox?.style.display;
        if (checkbox) checkbox.style.display = 'none';

        try {
          // 특정 차트가 렌더링 지연으로 무한 대기하더라도 전체 내보내기가 멈추지 않도록 30초 제한
          const canvas = await Promise.race([
            html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, imageTimeout: 15000 }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('capture timeout')), 30000)),
          ]);
          pages.push({ imgData: canvas.toDataURL('image/jpeg', 0.92), aspect: canvas.width / canvas.height });
        } catch (err) {
          console.warn(`VALD PDF: ${metric.key} 캡처 실패`, err);
          failedLabels.push(metric.label);
        } finally {
          if (checkbox && origCheckboxDisplay !== undefined) checkbox.style.display = origCheckboxDisplay;
        }
      }

      if (pages.length === 0) { alert('PDF로 캡처할 수 있는 항목이 없습니다.'); return; }

      // 항목마다 실제 높이가 제각각이라, 페이지를 절반씩 고정 분할하면 짧은 항목 주위에
      // 큰 공백이 남는다. 대신 위에서부터 실제 높이만큼 순서대로 채우고, 다음 항목이
      // 남은 공간에 들어가지 않을 때만 새 페이지로 넘겨 빈 공간을 최소화한다.
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 8;
      const availW = pdfW - margin * 2;
      const maxH = pdfH - margin * 2;
      let cursorY = margin;
      let isFirstPage = true;
      pages.forEach(p => {
        let dW = availW, dH = availW / p.aspect;
        if (dH > maxH) { dH = maxH; dW = maxH * p.aspect; }
        if (isFirstPage) {
          isFirstPage = false;
        } else if (cursorY + dH > pdfH - margin) {
          pdf.addPage('a4', 'portrait');
          cursorY = margin;
        }
        const x = (pdfW - dW) / 2;
        pdf.addImage(p.imgData, 'JPEG', x, cursorY, dW, dH);
        cursorY += dH + margin;
      });
      pdf.save(`VALD_리포트_${gradeFilter}_${roundFilter === ALL_ROUNDS ? '전체' : roundFilter}.pdf`);
      if (failedLabels.length > 0) alert(`다음 항목은 캡처에 실패해 PDF에서 제외되었습니다:\n${failedLabels.join(', ')}`);
      setPdfSelectMode(false);
    } finally {
      setPdfExporting(false);
    }
  }, [selectedMetrics, gradeFilter, roundFilter]);

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 text-sm rounded border transition-colors ${
        tab === id ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6">
      <div className="sec-title">피지컬</div>

      <div className="flex gap-2 mb-4">
        {tabBtn('vald', 'VALD')}
        {tabBtn('body', 'Body composition')}
        {tabBtn('speed', 'Speed custom')}
        {tabBtn('maturity', '신체 성숙도')}
      </div>

      {tab === 'vald' ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              {VALD_GRADES.map(g => (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                    gradeFilter === g ? 'bg-purple text-white border-purple' : 'border-surface-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {g}
                </button>
              ))}
              <select
                value={roundFilter}
                onChange={e => setRoundFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-md border border-surface-secondary bg-[var(--bg)] focus:outline-none focus:border-cyan-400"
              >
                {roundOptions.map(r => (
                  <option key={r} value={r}>{r === ALL_ROUNDS ? '전체 (개인 최고 기록)' : `${r}차`}</option>
                ))}
              </select>
            </div>

            {pdfSelectMode ? (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-text-secondary">{selectedMetrics.size}개 선택됨</span>
                <button
                  onClick={handleValdPdfExport}
                  disabled={pdfExporting || selectedMetrics.size === 0}
                  className="px-3 py-1.5 text-xs rounded-md bg-cyan-500 text-white hover:bg-cyan-600 transition-colors disabled:opacity-50"
                >
                  {pdfExporting ? 'PDF 생성 중...' : 'PDF로 내보내기'}
                </button>
                <button
                  onClick={() => setPdfSelectMode(false)}
                  disabled={pdfExporting}
                  className="px-3 py-1.5 text-xs rounded-md border border-surface-secondary hover:bg-surface-secondary transition-colors"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={startPdfSelect}
                className="px-3 py-1.5 text-xs rounded-md border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10 transition-colors"
              >
                📄 PDF 다운로드
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
          ) : valdEntries.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-16">해당 학년/차수의 VALD 측정 기록이 없습니다.</p>
          ) : (
            <>
              <ValdAnalysisInsightBox
                data={valdInsight} grade={gradeFilter} round={roundFilter}
                sectionRef={el => { sectionRefs.current['insight_analysis'] = el; }}
                selectable={pdfSelectMode} checked={selectedMetrics.has('insight_analysis')} onToggle={() => toggleMetric('insight_analysis')}
              />
              <ValdPrescriptionInsightBox
                data={valdInsight} grade={gradeFilter} round={roundFilter}
                sectionRef={el => { sectionRefs.current['insight_prescription'] = el; }}
                selectable={pdfSelectMode} checked={selectedMetrics.has('insight_prescription')} onToggle={() => toggleMetric('insight_prescription')}
              />
              {VALD_METRIC_DEFS.map(metric => (
                <ValdMetricSection
                  key={metric.key}
                  metricKey={metric.key}
                  label={metric.label}
                  unit={metric.unit}
                  invert={metric.invert}
                  hasLR={metric.hasLR}
                  note={metric.note}
                  tiers={metric.tiers}
                  dotPlot={metric.dotPlot}
                  entries={valdEntries}
                  threshold={thresholds.find(t => t.metric_key === metric.key && t.grade === gradeFilter) ?? null}
                  sectionRef={el => { sectionRefs.current[metric.key] = el; }}
                  selectable={pdfSelectMode}
                  checked={selectedMetrics.has(metric.key)}
                  onToggle={() => toggleMetric(metric.key)}
                />
              ))}
            </>
          )}
        </>
      ) : tab === 'maturity' ? (
        loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : (
          <MaturityCharts rows={maturityRows} players={players} />
        )
      ) : tab === 'speed' ? (
        loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : (
          <SpeedCustomCharts rows={speedCustomRows} players={players} maturityRows={maturityRows} />
        )
      ) : tab === 'body' ? (
        loading ? (
          <p className="text-sm text-text-secondary text-center py-16">로딩 중...</p>
        ) : (
          <BodyCompositionCharts rows={bodyRows} />
        )
      ) : null}
    </div>
  );
}
