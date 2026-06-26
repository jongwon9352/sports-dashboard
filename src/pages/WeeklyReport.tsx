import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { fetchSavedWeeks, fetchWeeklyPeriodization, fetchWeeklyGradeAvg, type DayPlan } from '../lib/api';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function parseVal(v: string): number {
  if (!v) return 0;
  const cleaned = v.replace(/[^0-9.~\-±,]/g, '');
  if (cleaned.includes('~')) {
    const pts = cleaned.split('~').map(Number).filter(n => !isNaN(n));
    return pts.length === 2 ? (pts[0] + pts[1]) / 2 : pts[0] || 0;
  }
  return parseFloat(cleaned.replace(/,/g, '')) || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PlanRealBarShape(planColor: string, realColor: string) {
  return (props: any) => {
    const { x, y, width, height, payload, dataKey } = props;
    if (!width) return null;
    const isPlan = dataKey === 'plan';
    const value = payload?.[dataKey] ?? 0;
    if (!value && !isPlan) return null;
    const fill = isPlan ? planColor : realColor;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height || 0}
          fill={isPlan ? 'transparent' : fill}
          stroke={isPlan ? planColor : 'none'}
          strokeWidth={isPlan ? 2 : 0}
          rx={2} />
        {!isPlan && value > 0 && (
          <text x={x + width / 2} y={y - 6} textAnchor="middle"
            fontSize={11} fontFamily="DM Mono" fill="#666">
            {typeof value === 'number' ? (Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)) : value}
          </text>
        )}
      </g>
    );
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StackedDecShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!width) return null;
  const total = (payload?.acc || 0) + (payload?.dec || 0);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height || 0}
        fill="rgba(255, 152, 0, 0.7)" rx={2} />
      {total > 0 && (
        <text x={x + width / 2} y={y - 6} textAnchor="middle"
          fontSize={11} fontFamily="DM Mono" fontWeight="600" fill="#333">
          {total % 1 === 0 ? total : total.toFixed(1)}
        </text>
      )}
    </g>
  );
}

function WeeklyChart({ title, data, planKey, realKey, planColor, realColor, unit = '' }: {
  title: string;
  data: { day: string; plan: number; real: number }[];
  planKey?: string; realKey?: string;
  planColor: string; realColor: string;
  unit?: string;
}) {
  void planKey; void realKey;
  const maxVal = Math.max(...data.map(d => Math.max(d.plan, d.real)), 1);
  return (
    <div className="chart-card mb-4">
      <div className="chart-title text-center">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 25, right: 15, bottom: 5, left: 15 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} width={55} domain={[0, Math.ceil(maxVal * 1.15)]} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}${unit}`]}
            contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="plan" name="Plan" fill={planColor} barSize={30}
            shape={PlanRealBarShape(planColor, realColor)} />
          <Bar dataKey="real" name="Real" fill={realColor} barSize={30}
            shape={PlanRealBarShape(planColor, realColor)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyReport() {
  const [savedWeeks, setSavedWeeks] = useState<{ week_start: string; week_label: string }[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [periodization, setPeriodization] = useState<{ topic: string; label: string; days: DayPlan[] } | null>(null);
  const [realData, setRealData] = useState<{
    date: string; day: string;
    td: number; hsr: number; sprint: number; acc: number; dec: number; acd_load: number; max_speed: number;
    training_load: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchSavedWeeks().then(weeks => {
      setSavedWeeks(weeks);
      if (weeks.length > 0) setSelectedWeek(weeks[0].week_start);
      setLoading(false);
    });
  }, []);

  const loadWeekData = useCallback(async (weekStart: string) => {
    if (!weekStart) return;
    setLoading(true);
    const [wp, avg] = await Promise.all([
      fetchWeeklyPeriodization(weekStart),
      fetchWeeklyGradeAvg(weekStart, ['U15', 'U14', '3학년', '2학년']),
    ]);
    if (wp) {
      let days = wp.days;
      while (typeof days === 'string') days = JSON.parse(days);
      setPeriodization({ topic: wp.weekly_topic, label: wp.week_label, days: Array.isArray(days) ? days : [] });
    } else {
      setPeriodization(null);
    }
    setRealData(avg);
    const savedComment = sessionStorage.getItem(`weeklyComment_${weekStart}`) || '';
    setComment(savedComment);
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedWeek) loadWeekData(selectedWeek); }, [selectedWeek, loadWeekData]);

  useEffect(() => {
    if (selectedWeek) sessionStorage.setItem(`weeklyComment_${selectedWeek}`, comment);
  }, [comment, selectedWeek]);

  const days = periodization?.days || [];

  const headerData = useMemo(() => {
    return DAY_LABELS.map((dayLabel, i) => {
      const plan = days[i];
      const real = realData[i];
      const dateStr = real?.date || '';
      return {
        day: dayLabel,
        date: dateStr ? `${dateStr.slice(5)}` : '',
        perio: plan?.periodization || '',
        perioCode: plan?.perio_code || '',
        trainingType: plan?.physical_goal || '',
        planTL: plan?.training_load || '',
        planTD: plan?.total_distance || '',
        planHSR: plan?.hsr_distance || '',
        planSprint: plan?.sprint_distance || '',
        planAccDec: plan?.acc_dec || '',
        realTL: real?.training_load || 0,
        realTD: real?.td || 0,
        realHSR: real?.hsr || 0,
        realSprint: real?.sprint || 0,
        realAcc: real?.acc || 0,
        realDec: real?.dec || 0,
        realAcdLoad: real?.acd_load || 0,
        realMaxSpeed: real?.max_speed || 0,
      };
    });
  }, [days, realData]);

  const tlChartData = headerData.map(d => ({
    day: d.day, plan: parseVal(d.planTL), real: d.realTL,
  }));
  const tdChartData = headerData.map(d => ({
    day: d.day, plan: parseVal(d.planTD), real: d.realTD,
  }));
  const hsrChartData = headerData.map(d => ({
    day: d.day, plan: parseVal(d.planHSR), real: d.realHSR,
  }));
  const sprintChartData = headerData.map(d => ({
    day: d.day, plan: parseVal(d.planSprint), real: d.realSprint,
  }));
  const accDecChartData = headerData.map(d => ({
    day: d.day, acc: d.realAcc, dec: d.realDec,
  }));
  const acdLoadChartData = headerData.map(d => ({
    day: d.day, plan: 0, real: d.realAcdLoad,
  }));

  const weekTotals = useMemo(() => {
    const planTL = headerData.reduce((s, d) => s + parseVal(d.planTL), 0);
    const realTL = headerData.reduce((s, d) => s + d.realTL, 0);
    const planTD = headerData.reduce((s, d) => s + parseVal(d.planTD), 0);
    const realTD = headerData.reduce((s, d) => s + d.realTD, 0);
    const planHSR = headerData.reduce((s, d) => s + parseVal(d.planHSR), 0);
    const realHSR = headerData.reduce((s, d) => s + d.realHSR, 0);
    const planSprint = headerData.reduce((s, d) => s + parseVal(d.planSprint), 0);
    const realSprint = headerData.reduce((s, d) => s + d.realSprint, 0);
    return { planTL, realTL, planTD, realTD, planHSR, realHSR, planSprint, realSprint };
  }, [headerData]);

  const thC = 'px-2 py-2 text-[10px] font-semibold whitespace-nowrap border border-surface-secondary text-center';
  const tdC = 'px-2 py-1.5 text-[10px] whitespace-nowrap border border-surface-secondary text-center';

  const accDecMax = Math.max(...accDecChartData.map(d => d.acc + d.dec), 1);

  return (
    <div className="p-6">
      <div className="sec-title">위클리 리포트</div>

      <div className="flex items-center gap-3 mb-5">
        <label className="text-[10px] tracking-[1px] uppercase text-text-disabled" style={{ fontFamily: 'var(--font-data)' }}>
          주차 선택
        </label>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          className="px-3 py-1.5 border border-surface-secondary rounded-[var(--radius-sm)] text-sm bg-white outline-none focus:border-purple"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          {savedWeeks.map(w => (
            <option key={w.week_start} value={w.week_start}>
              {w.week_label || w.week_start}
            </option>
          ))}
        </select>
        {periodization && (
          <span className="text-xs text-text-secondary ml-2">{periodization.topic}</span>
        )}
      </div>

      {loading ? (
        <div className="text-text-secondary text-center py-16">Loading...</div>
      ) : (
        <>
          {/* 헤더 테이블 */}
          <div className="chart-card mb-5 overflow-x-auto">
            <div className="text-center mb-2">
              <span className="text-sm font-bold">DAEJEON HANA CITIZEN U15 Weekly DATA</span>
            </div>
            <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-data)', fontSize: 10 }}>
              <thead>
                <tr>
                  <th className={thC} style={{ minWidth: 80 }}>항목</th>
                  {headerData.map((d, i) => (
                    <th key={i} className={thC}>{d.date}<br />{d.day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${tdC} font-semibold`}>주기</td>
                  {headerData.map((d, i) => <td key={i} className={tdC}>{d.perioCode || d.perio}</td>)}
                </tr>
                <tr>
                  <td className={`${tdC} font-semibold`}>훈련 타입</td>
                  {headerData.map((d, i) => <td key={i} className={tdC}>{d.trainingType}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 차트들 */}
          <WeeklyChart title="훈련 부하" data={tlChartData}
            planColor="#4CAF50" realColor="rgba(139, 195, 74, 0.7)" />

          <WeeklyChart title="총 이동거리 (m)" data={tdChartData}
            planColor="#FF5722" realColor="rgba(139, 195, 74, 0.7)" unit=" m" />

          <WeeklyChart title="고강도 이동거리 (m)" data={hsrChartData}
            planColor="#FF5722" realColor="rgba(0, 140, 126, 0.6)" unit=" m" />

          <WeeklyChart title="스프린트 거리 (m)" data={sprintChartData}
            planColor="#3F51B5" realColor="rgba(164, 40, 67, 0.6)" unit=" m" />

          {/* 가속/감속 횟수 (누적) */}
          <div className="chart-card mb-4">
            <div className="chart-title text-center">가속/감속 횟수 (times)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={accDecChartData} margin={{ top: 25, right: 15, bottom: 5, left: 15 }} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono' }} width={55} domain={[0, Math.ceil(accDecMax * 1.25)]} />
                <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}회`]}
                  contentStyle={{ fontFamily: 'DM Mono', fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="acc" name="ACC" fill="rgba(33, 150, 243, 0.7)" stackId="ad" barSize={28} />
                <Bar dataKey="dec" name="DEC" fill="rgba(255, 152, 0, 0.7)" stackId="ad" barSize={28}
                  shape={<StackedDecShape />} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ACD LOAD */}
          <WeeklyChart title="ACD LOAD (intensity)" data={acdLoadChartData}
            planColor="transparent" realColor="rgba(140, 20, 20, 0.7)" />

          {/* Plan/Real 주간 합계 */}
          <div className="chart-card mb-4">
            <div className="chart-title text-center">주간 팀 평균 (Plan / Real)</div>
            <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>
              <thead>
                <tr>
                  <th className={thC}>항목</th>
                  <th className={thC}>TL</th>
                  <th className={thC}>TD (m)</th>
                  <th className={thC}>HSR (m)</th>
                  <th className={thC}>Sprint (m)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${tdC} font-semibold`}>Plan</td>
                  <td className={tdC}>{weekTotals.planTL.toLocaleString()}</td>
                  <td className={tdC}>{weekTotals.planTD.toLocaleString()}</td>
                  <td className={tdC}>{weekTotals.planHSR.toLocaleString()}</td>
                  <td className={tdC}>{weekTotals.planSprint.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className={`${tdC} font-semibold`}>Real</td>
                  <td className={tdC}>{weekTotals.realTL.toLocaleString()}</td>
                  <td className={tdC}>{weekTotals.realTD.toLocaleString()}</td>
                  <td className={tdC}>{weekTotals.realHSR.toLocaleString()}</td>
                  <td className={tdC}>{weekTotals.realSprint.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 코멘트 */}
          <div className="chart-card mb-4">
            <div className="chart-title">코멘트</div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="주간 코멘트를 입력하세요..."
              className="w-full px-4 py-3 text-sm rounded-lg border border-surface-secondary bg-transparent outline-none resize-y min-h-[100px] focus:border-purple"
            />
          </div>
        </>
      )}
    </div>
  );
}
