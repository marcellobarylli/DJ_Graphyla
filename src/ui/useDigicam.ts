import { useEffect, useState } from 'react';
import { overexpose } from '../domain/digicam';

const cache = new Map<string, Promise<string | null>>();

async function render(src: string, cells: number): Promise<string | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.naturalWidth || cells;
  const h = img.naturalHeight || cells;
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = cells;
  canvas.height = cells;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  // Centre square of the picture, scaled down to one pixel per block.
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, cells, cells);
  const pixels = ctx.getImageData(0, 0, cells, cells);
  overexpose(pixels.data);
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * The picture at `src` as a small, overexposed square of `cells`×`cells`
 * pixels (shown scaled up with `image-rendering: pixelated`), or null when it
 * can't be read (not loaded, broken, or from another site).
 */
export function digicamUrl(src: string, cells: number): Promise<string | null> {
  const key = `${cells}|${src}`;
  let job = cache.get(key);
  if (!job) {
    job = render(src, cells).catch(() => null);
    cache.set(key, job);
  }
  return job;
}

/** `src` through the digicam while `on`; the original picture until the copy is ready, or if it fails. */
export function useDigicam(src: string | null | undefined, cells: number, on: boolean): { src: string | null | undefined; pixelated: boolean } {
  const [done, setDone] = useState<{ key: string; url: string | null } | null>(null);
  const key = `${cells}|${src ?? ''}`;
  useEffect(() => {
    if (!on || !src) return;
    let live = true;
    void digicamUrl(src, cells).then((url) => live && setDone({ key, url }));
    return () => {
      live = false;
    };
  }, [on, src, cells, key]);
  const url = on && done?.key === key ? done.url : null;
  return url ? { src: url, pixelated: true } : { src, pixelated: false };
}
