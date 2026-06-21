import type { MaturityStatus } from '../types';

const config: Record<MaturityStatus, { label: string; bg: string; text: string }> = {
  Pre: { label: 'Pre-PHV', bg: '#E8EEF5', text: '#153E6F' },
  Mid: { label: 'Mid-PHV', bg: '#FFF6CC', text: '#8A6B00' },
  Post: { label: 'Post-PHV', bg: '#E0F3F0', text: '#006D62' },
};

export function MaturityBadge({ status }: { status: MaturityStatus }) {
  const c = config[status];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}
