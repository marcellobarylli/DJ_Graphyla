/** A DJ's profile picture in the record shop, or their initials when there is none. */
export function DjAvatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0]!.toUpperCase())
      .join('') || '?';
  return src ? (
    <img className="dj-avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className="dj-avatar dj-avatar-initials" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

/** Size of the square picture stored in a profile. */
export const AVATAR_PX = 256;

/**
 * Turns a photo from the device into a small square profile picture: cropped
 * to the centre, scaled to 256×256 and saved as JPEG (about 20–40 KB), so it
 * fits in the profile file.
 */
export async function pictureToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a picture (JPEG, PNG, HEIC…).');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('This picture could not be opened. Try a JPEG or PNG.');
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
