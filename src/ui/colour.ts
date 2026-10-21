/** How light a hex colour looks, from 0 (black) to 1 (white). */
export const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/** Inline text styling that stays readable on a team colour: white on dark colours, dark on light ones. */
export const textOn = (hex: string): string => (lum(hex) > 0.62 ? 'color:#1a1300;text-shadow:none' : 'color:#fff');
