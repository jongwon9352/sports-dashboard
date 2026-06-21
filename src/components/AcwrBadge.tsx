import type { AcwrZone } from '../types';
import { getZoneColor, getZoneLabel } from '../utils/calculations';

interface Props {
  zone: AcwrZone;
  acwr?: number;
}

export function AcwrBadge({ zone, acwr }: Props) {
  const color = getZoneColor(zone);
  const label = getZoneLabel(zone);

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-sm font-medium" style={{ color }}>
        {zone === 'insufficient' ? label : acwr?.toFixed(2)}
      </span>
      <span className="text-xs text-text-secondary">
        {zone !== 'insufficient' && label}
      </span>
    </div>
  );
}
