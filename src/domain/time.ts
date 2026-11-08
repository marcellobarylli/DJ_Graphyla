/**
 * Timestamp helpers. Timestamps are stored as seconds (number).
 *
 * Accepted input formats for `parseTimestamp`:
 *  - "1:23", "01:23", "1:02:03", "1:23.5"     (colon separated)
 *  - "123" → 1:23, "45" → 0:45, "1234" → 12:34 (digits only, like a microwave
 *    timer — lets you type mix points on a phone's numeric keypad)
 *  - "123.5" → 1:23.5
 */
export function parseTimestamp(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;

  if (text.includes(':')) {
    const parts = text.split(':');
    if (parts.length > 3 || parts.some((p) => p === '')) return null;
    const secondsPart = parts[parts.length - 1]!;
    const wholeParts = parts.slice(0, -1);
    if (!/^\d+(\.\d+)?$/.test(secondsPart) || !wholeParts.every((p) => /^\d+$/.test(p))) return null;
    const seconds = Number(secondsPart);
    if (seconds >= 60) return null;
    if (parts.length === 3 && Number(parts[1]) >= 60) return null;
    const [minutes, hours] = wholeParts.map(Number).reverse();
    return round3((hours ?? 0) * 3600 + (minutes ?? 0) * 60 + seconds);
  }

  const match = /^(\d+)(\.\d+)?$/.exec(text);
  if (!match) return null;
  const digits = match[1]!;
  const fraction = match[2] ? Number(match[2]) : 0;
  if (digits.length <= 2) return round3(Number(digits) + fraction);
  const seconds = Number(digits.slice(-2)) + fraction;
  if (seconds >= 60) return null;
  return round3(Number(digits.slice(0, -2)) * 60 + seconds);
}

/** 83 → "1:23", 83.5 → "1:23.5", 3723 → "1:02:03". */
export function formatTimestamp(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = round3(totalSeconds - hours * 3600 - minutes * 60);
  const wholeSeconds = Math.floor(seconds);
  const fraction = round3(seconds - wholeSeconds);
  const ss = String(wholeSeconds).padStart(2, '0') + (fraction > 0 ? String(fraction).slice(1) : '');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
