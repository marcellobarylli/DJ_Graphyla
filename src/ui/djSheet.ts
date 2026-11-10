/**
 * Layout of the chrome DJs' pictures (src/assets/y2k/man*.webp, woman*.webp,
 * rendered by tools/y2k-art). Every picture has the same frame size, with the
 * figure at the same scale and spot, so the still and the dance frames line
 * up. The dance sheets have two rows: the dance loop (two beats, frame 0 on
 * the beat) and the spin done when the song changes.
 */
export const DJ_SHEET = {
  frameWidth: 640,
  frameHeight: 1560,
  loopFrames: 12,
  moveFrames: 12,
} as const;
