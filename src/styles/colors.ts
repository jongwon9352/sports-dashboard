export const colors = {
  wine: '#A42843',
  navy: '#153E6F',
  green: '#008C7E',
  yellow: '#FFD900',
  black: '#101820',
  white: '#FFFFFF',
  muted: '#66717A',
  grid: '#E2E8E5',
  danger: '#A42843',
  warning: '#B08A00',
  warningFill: '#FFD900',
  safe: '#008C7E',
} as const;

export const chartColors = {
  primary: colors.navy,
  secondary: colors.green,
  tertiary: colors.wine,
  warning: colors.warning,
  warningFill: colors.yellow,
  muted: colors.muted,
  grid: colors.grid,
} as const;
