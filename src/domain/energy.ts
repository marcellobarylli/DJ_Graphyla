/**
 * Energy: how hard a song goes, 0–100, as the DJ feels it. Purely subjective,
 * set per song. It correlates with tempo but is not the same thing: a 124 BPM
 * deep cut and a 124 BPM peak-time anthem are worlds apart.
 *
 * The scale is cut into ten bands of ten (0–9, 10–19, …, 90–100). Each band has
 * a name, so a number reads as a feeling, and a colour on one colour map.
 * You only ever type the number; the name and colour follow.
 */

export const ENERGY_MIN = 0;
export const ENERGY_MAX = 100;

export interface EnergyBand {
  /** 0 … 9 */
  index: number;
  /** Lowest energy in the band. */
  from: number;
  /** Highest energy in the band (the last band includes 100). */
  to: number;
  name: string;
  /** What the dancefloor does. */
  blurb: string;
}

const NAMES: [string, string][] = [
  ['Flatline', 'Is anyone alive in here?'],
  ['Snooze Button', 'Five more minutes'],
  ['Lounge Lizard', 'Cocktail in hand, swaying slightly'],
  ['Head Nod', 'Arms crossed, but the head says yes'],
  ['Toe Tapper', 'The feet have started without you'],
  ['Hip Swinger', 'Officially dancing now'],
  ['Hands in the Air', 'Like you just don’t care'],
  ['Sweat Factory', 'Condensation on the ceiling'],
  ['Rave Goblin', 'Feral, shirtless, unstoppable'],
  ['Roof Off', 'Call the fire brigade'],
];

export const ENERGY_BANDS: readonly EnergyBand[] = NAMES.map(([name, blurb], index) => ({
  index,
  from: index * 10,
  to: index === 9 ? 100 : index * 10 + 9,
  name,
  blurb,
}));

/** Valid energy: a whole number 0–100. */
export function isEnergy(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= ENERGY_MIN && v <= ENERGY_MAX;
}

export function energyError(v: number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (!isEnergy(v)) return `Energy is a whole number, ${ENERGY_MIN}–${ENERGY_MAX}`;
  return undefined;
}

/** The band (0–9) a valid energy falls in. */
export function energyBand(energy: number): EnergyBand {
  const i = Math.min(9, Math.max(0, Math.floor(energy / 10)));
  return ENERGY_BANDS[i]!;
}

/** Text from an input → energy. Blank is null; anything that isn't a number is NaN (caught by validation). */
export function parseEnergy(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+([.,]\d*)?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

export const formatEnergy = (energy: number | null | undefined): string => (energy === null || energy === undefined ? '' : String(energy));

/** "72 · Sweat Factory" */
export function energyLabel(energy: number): string {
  return `${energy} · ${energyBand(energy).name}`;
}

/**
 * The colour map, one colour per band, for a dark and a light canvas. Same
 * hues in both (indigo → violet → magenta → pink → red → orange → amber →
 * yellow); lightness rises steadily with the energy, so the order also reads
 * without colour vision. The light-canvas steps are darker so the hot end
 * still shows on white. Neighbouring bands differ by ΔE(OKLab) ≈ 7–9; the weak
 * end keeps ≥ 1.8:1 against the canvas (nodes also keep their border).
 * Names and numbers are always shown next to the colour, so it is never the
 * only cue.
 */
export const ENERGY_COLORS: Record<'dark' | 'light', readonly string[]> = {
  dark: ['#522ba8', '#7a30aa', '#a134a3', '#c53b93', '#e5467c', '#fd5a5e', '#fe8353', '#fea353', '#ffc054', '#ffdd30'],
  light: ['#481d9b', '#6c1e9a', '#8e1f90', '#ae217f', '#ca2966', '#df3c45', '#ea5808', '#e27f03', '#dd9c05', '#d4b60c'],
};

export function energyColor(energy: number, scheme: 'dark' | 'light'): string {
  return ENERGY_COLORS[scheme][energyBand(energy).index]!;
}

/** A CSS gradient through the whole map, for the scale under the energy field and the legend. */
export function energyGradient(scheme: 'dark' | 'light'): string {
  const colors = ENERGY_COLORS[scheme];
  const stops = colors.map((c, i) => `${c} ${i * 10}% ${i * 10 + 10}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
