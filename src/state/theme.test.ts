import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, EDGE_COLORS, THEMES, THEME_KEY, loadTheme, parseTheme, saveTheme, themeInfo } from './theme';

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('themes', () => {
  it('offers the original look plus the two Y2K looks', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['graphyla', 'swag', 'futurism']);
    expect(DEFAULT_THEME).toBe('graphyla');
  });

  it('names the swag look in leet, with a readable spoken name', () => {
    const swag = themeInfo('swag');
    expect(swag.name).toBe('SW4G 3R4');
    expect(swag.spokenName).toBe('Swag Era');
    expect(swag.appName).toBe('DJ GR4PHYL4');
  });

  it('keeps the graph canvas in step with the page background', () => {
    for (const t of THEMES) expect(t.graph.canvas).toBe(t.themeColor);
  });

  it('makes SW4G 3R4 the light look (issue #12)', () => {
    expect(themeInfo('swag').scheme).toBe('light');
    expect(themeInfo('graphyla').scheme).toBe('dark');
    expect(themeInfo('futurism').scheme).toBe('dark');
  });

  it('steps the rating colours so they read on every canvas', () => {
    for (const t of THEMES) {
      const c = EDGE_COLORS[t.scheme];
      const ramp = ([2, 3, 4, 5] as const).map((r) => contrast(c.ramp[r], t.graph.canvas));
      // A higher rating always stands out more; the weakest still clears 2:1.
      for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]!);
      expect(ramp[0]).toBeGreaterThanOrEqual(2);
      expect(contrast(c.bad, t.graph.canvas)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.set, t.graph.canvas)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.graph.text, t.graph.canvas)).toBeGreaterThanOrEqual(7);
    }
  });

  it('gives the graph a label font Cytoscape accepts (no single quotes)', () => {
    for (const t of THEMES) expect(t.graph.font).toMatch(/^[\w\- ",]+$/);
    expect(themeInfo('futurism').graph.font).toContain('"Oxanium Variable"');
  });
});

describe('parseTheme', () => {
  it('accepts known ids', () => {
    expect(parseTheme('swag')).toBe('swag');
    expect(parseTheme('futurism')).toBe('futurism');
  });

  it('falls back to the default for unknown or missing values', () => {
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme('vaporwave')).toBe(DEFAULT_THEME);
    expect(parseTheme(42)).toBe(DEFAULT_THEME);
  });
});

describe('loadTheme / saveTheme', () => {
  it('round-trips through storage', () => {
    const store = memoryStore();
    expect(loadTheme(store)).toBe(DEFAULT_THEME);
    saveTheme('futurism', store);
    expect(store.data.get(THEME_KEY)).toBe('futurism');
    expect(loadTheme(store)).toBe('futurism');
  });

  it('ignores a garbled stored value', () => {
    expect(loadTheme(memoryStore({ [THEME_KEY]: '{"oops"' }))).toBe(DEFAULT_THEME);
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadTheme(blocked)).toBe(DEFAULT_THEME);
    expect(() => saveTheme('swag', blocked)).not.toThrow();
  });
});
