/** Mix-point helpers: positions are bars (primary) with an optional timestamp. */
import { formatTimestamp } from './time';

/** "97" → 97. Empty → null, anything that is not a positive whole number → NaN. */
export function parseBar(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return Number.NaN;
  return Number(text);
}

export function formatBar(bar: number | null | undefined): string {
  return bar === null || bar === undefined ? '' : String(bar);
}

/** "bar 97 · 5:00", "bar 97", "5:00" or "" */
export function formatPosition(bar: number | null, time: number | null): string {
  const parts: string[] = [];
  if (bar !== null) parts.push(`bar ${bar}`);
  if (time !== null) parts.push(formatTimestamp(time));
  return parts.join(' · ');
}
