import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, THEME_KEY, loadTheme, parseTheme, saveTheme, themeInfo } from './theme';

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
