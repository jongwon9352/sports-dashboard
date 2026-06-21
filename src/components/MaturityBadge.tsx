import type { MaturityStatus } from '../types';

const config: Record<MaturityStatus, { label: string; bg: string; text: string }> = {
  Pre: { label: 'Pre-PHV', bg: '#E3F2FD', text: '#1565C0' },
  Mid: { label: 'Mid-PHV', bg: '#FFF3E0', text: '#E65100' },
  Post: { label: 'Post-PHV', bg: '#E8F5E9', text: '#2E7D32' },
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
