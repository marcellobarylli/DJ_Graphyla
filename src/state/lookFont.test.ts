import { describe, expect, it } from 'vitest';
import { MAX_FONT_BYTES, checkFontFile, fontName, parseStoredFont } from './lookFont';

describe('checkFontFile', () => {
  it('accepts common font formats', () => {
    for (const name of ['Xylem.ttf', 'AF Xylem.OTF', 'x.woff', 'x.woff2']) {
      expect(checkFontFile({ name, size: 40_000 })).toBeNull();
    }
  });

  it('rejects other files, empty files and very large ones', () => {
    expect(checkFontFile({ name: 'cover.png', size: 1000 })).toMatch(/font file/);
    expect(checkFontFile({ name: 'Xylem.ttf', size: 0 })).toMatch(/empty/);
    expect(checkFontFile({ name: 'Xylem.ttf', size: MAX_FONT_BYTES + 1 })).toMatch(/limit is 512 KB/);
  });
});

describe('fontName', () => {
  it('turns a file name into a readable font name', () => {
    expect(fontName('AF_Xylem-Regular.ttf')).toBe('AF Xylem Regular');
    expect(fontName('Xylem.woff2')).toBe('Xylem');
    expect(fontName('.ttf')).toBe('Custom font');
  });
});

describe('parseStoredFont', () => {
  it('reads a saved font', () => {
    const saved = JSON.stringify({ name: 'Xylem', dataUrl: 'data:font/ttf;base64,AAEAAA' });
    expect(parseStoredFont(saved)).toEqual({ name: 'Xylem', dataUrl: 'data:font/ttf;base64,AAEAAA' });
  });

  it('ignores missing, garbled or unsafe entries', () => {
    expect(parseStoredFont(null)).toBeNull();
    expect(parseStoredFont('{oops')).toBeNull();
    expect(parseStoredFont(JSON.stringify({ name: 'X', dataUrl: 'https://example.com/x.ttf' }))).toBeNull();
    expect(parseStoredFont(JSON.stringify({ name: 3, dataUrl: 'data:x' }))).toBeNull();
  });
});
