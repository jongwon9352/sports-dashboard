import { colors } from '../styles/colors';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  valueColor?: string;
}

export function StatCard({ label, value, sub, accent = colors.navy, valueColor }: Props) {
  return (
    <div className="stat-card">
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: accent }}
      />
      <p
        className="text-[10px] tracking-[1.5px] uppercase mb-2 text-text-disabled"
        style={{ fontFamily: 'var(--font-data)' }}
      >
        {label}
      </p>
      <p
        className="text-[32px] font-bold leading-none tracking-tight"
        style={{ color: valueColor ?? undefined }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-text-disabled mt-1">{sub}</p>
      )}
    </div>
  );
}
