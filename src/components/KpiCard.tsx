interface Props {
  title: string;
  value: string | number;
  unit?: string;
  color?: string;
}

export function KpiCard({ title, value, unit, color }: Props) {
  return (
    <div className="bg-surface rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-1)]">
      <p className="text-sm text-text-secondary mb-1">{title}</p>
      <p className="text-2xl font-bold" style={color ? { color } : undefined}>
        {value}
        {unit && <span className="text-sm font-normal text-text-secondary ml-1">{unit}</span>}
      </p>
    </div>
  );
}
