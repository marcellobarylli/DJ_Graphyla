/**
 * The "classic digicam" treatment of the SW4G 3R4 look (issue #12): pictures
 * come out overexposed, as from an early-2000s camera with the flash on.
 * Pure pixel maths on RGBA data, so it works the same in every browser
 * (Safari's canvas has no `filter`) and can be tested without a DOM.
 */

/** Tone curve: lifts the shadows and mid-tones and blows out the highlights. */
export function exposeChannel(v: number): number {
  const x = v / 255;
  const lifted = 1 - (1 - x) ** 1.9; // brighter, flatter: the flash
  const blown = Math.min(1, lifted * 1.08 + 0.04); // highlights clip to white
  return Math.round(blown * 255);
}

const CURVE = Uint8ClampedArray.from({ length: 256 }, (_, v) => exposeChannel(v));

/**
 * Overexposes RGBA pixels in place: the tone curve, then 25% less colour
 * (cheap sensors washed colours out). Alpha is left alone.
 */
export function overexpose(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const r = CURVE[data[i]!]!;
    const g = CURVE[data[i + 1]!]!;
    const b = CURVE[data[i + 2]!]!;
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = r + (grey - r) * 0.25;
    data[i + 1] = g + (grey - g) * 0.25;
    data[i + 2] = b + (grey - b) * 0.25;
  }
  return data;
}

/** How many pixel blocks across a picture shown `size` CSS px wide gets (blocks of about 3 px). */
export function digicamCells(size: number): number {
  return Math.min(32, Math.max(10, Math.round(size / 3)));
}

/** A digicam date stamp for `date`, e.g. "'26 11 09". */
export function dateStamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `'${two(date.getFullYear() % 100)} ${two(date.getMonth() + 1)} ${two(date.getDate())}`;
}
