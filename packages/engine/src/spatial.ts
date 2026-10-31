export function scaledOdd(value: number, scale: number, min = 1): number {
  return Math.max(min, Math.round((value * scale - 1) / 2) * 2 + 1);
}
