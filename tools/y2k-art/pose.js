/**
 * Poses the chrome DJs (tools/y2k-art/bodies, built by bodies.py) with linear
 * blend skinning on MakeHuman's skeleton, and holds their choreography: the
 * still pose, the dance loop and the spin they do when the song changes.
 * Plain JavaScript without three.js, so it also runs in Node.
 *
 * Coordinates are MakeHuman's, in decimetres: x to the figure's left, y up,
 * z forward (the figure faces +z). A pose maps bone names to 3×3 rotations
 * (row-major) about the bone's head joint, in its parent's rest frame.
 */

/* ── reading a figure ─────────────────────────────────────────────────── */

/**
 * The binary written by bodies.py (little endian): five uint32 counts
 * (vertices, mesh vertices, indices, weights, skull vertices), then float32
 * rest positions, float32 weights, uint16 triangle indices, uint16 weight
 * vertices, uint16 skull vertices and uint8 weight bones. The bones (name,
 * parent index, head and tail joints) are in the .json next to it.
 */
export function readFigure(buffer, meta) {
  const [nVerts, nMesh, nIdx, nInf, nSkull] = new Uint32Array(buffer, 0, 5);
  let at = 20;
  const take = (Type, n) => {
    const a = new Type(buffer, at, n);
    at += n * Type.BYTES_PER_ELEMENT;
    return a;
  };
  const rest = take(Float32Array, nVerts * 3);
  const weight = take(Float32Array, nInf);
  const index = take(Uint16Array, nIdx);
  const infVertex = take(Uint16Array, nInf);
  const skull = take(Uint16Array, nSkull);
  const infBone = take(Uint8Array, nInf);
  const bones = meta.bones;
  const byName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  // Sole vertices, to keep the feet planted: mostly moved by a foot or toe bone.
  const footBones = new Set(bones.flatMap((b, i) => (/^(foot|toe)/.test(b.name) ? [i] : [])));
  const footShare = new Float64Array(nVerts);
  const total = new Float64Array(nVerts);
  for (let k = 0; k < nInf; k++) {
    total[infVertex[k]] += weight[k];
    if (footBones.has(infBone[k])) footShare[infVertex[k]] += weight[k];
  }
  const feet = [];
  for (let v = 0; v < nMesh; v++) if (total[v] > 0 && footShare[v] / total[v] > 0.5) feet.push(v);
  return { rest, meshCount: nMesh, index, weight, infVertex, infBone, skull, bones, byName, feet };
}

/* ── rotations ────────────────────────────────────────────────────────── */

const RAD = Math.PI / 180;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** a · b for row-major 3×3 matrices. */
export function mul(a, b) {
  const m = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return m;
}

const apply = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/** Rotation from (x, y, z) degrees around the axes, applied in the order z, y, x (as bodies.py did). */
export function euler([dx, dy, dz]) {
  const [x, y, z] = [dx * RAD, dy * RAD, dz * RAD];
  const rx = [1, 0, 0, 0, Math.cos(x), -Math.sin(x), 0, Math.sin(x), Math.cos(x)];
  const ry = [Math.cos(y), 0, Math.sin(y), 0, 1, 0, -Math.sin(y), 0, Math.cos(y)];
  const rz = [Math.cos(z), -Math.sin(z), 0, Math.sin(z), Math.cos(z), 0, 0, 0, 1];
  return mul(mul(rx, ry), rz);
}

/** Rotation by `deg` degrees around a unit axis (right-hand rule). */
export function aroundAxis([x, y, z], deg) {
  const a = deg * RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/* ── skinning ─────────────────────────────────────────────────────────── */

/** Transpose of a 3×3 rotation applied to a vector (the inverse rotation). */
const applyT = (m, [x, y, z]) => [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];

/** The smallest rotation that turns unit vector `a` onto unit vector `b`. */
function between(a, b) {
  const axis = cross(a, b);
  const s = Math.hypot(axis[0], axis[1], axis[2]);
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (s < 1e-9) return IDENTITY;
  return aroundAxis(unit(axis), Math.atan2(s, c) / RAD);
}

/** Limb segments that can be aimed: from the bone's head to the head of this bone. */
const SEGMENT_END = { upperarm01: 'lowerarm01', lowerarm01: 'wrist', upperleg01: 'lowerleg01', lowerleg01: 'foot' };

/**
 * Poses the figure. `rotations` maps bone names to 3×3 rotations, or to
 * `{ aim: [x, y, z] }` for a limb segment (upper arm, forearm, thigh, shin):
 * the segment then points that way in world space, whatever its parents do.
 * Other bones keep their rest orientation relative to their parent. Returns
 * the posed vertices (float64, MakeHuman coordinates) and the head bone's
 * rotation.
 */
export function skin(fig, rotations) {
  const { rest, bones, weight, infVertex, infBone } = fig;
  // World transform of each bone as [3×3 rotation, translation]; parents come first.
  const world = bones.map(() => null);
  bones.forEach((b, i) => {
    let r = rotations[b.name] ?? IDENTITY;
    if (r.aim) {
      const [kind, s] = b.name.split('.');
      const end = bones[fig.byName[`${SEGMENT_END[kind]}.${s}`]].head;
      const parent = b.parent === null ? IDENTITY : world[b.parent].r;
      r = between(unit(sub(end, b.head)), unit(applyT(parent, r.aim)));
    }
    const rh = apply(r, b.head);
    const local = { r, t: [b.head[0] - rh[0], b.head[1] - rh[1], b.head[2] - rh[2]] };
    if (b.parent === null) {
      world[i] = local;
      return;
    }
    const p = world[b.parent];
    const pt = apply(p.r, local.t);
    world[i] = { r: mul(p.r, local.r), t: [pt[0] + p.t[0], pt[1] + p.t[1], pt[2] + p.t[2]] };
  });

  const n = rest.length / 3;
  const out = new Float64Array(n * 3);
  const total = new Float64Array(n);
  for (let k = 0; k < weight.length; k++) {
    const v = infVertex[k];
    const w = weight[k];
    const { r, t } = world[infBone[k]];
    const x = rest[v * 3];
    const y = rest[v * 3 + 1];
    const z = rest[v * 3 + 2];
    out[v * 3] += w * (r[0] * x + r[1] * y + r[2] * z + t[0]);
    out[v * 3 + 1] += w * (r[3] * x + r[4] * y + r[5] * z + t[1]);
    out[v * 3 + 2] += w * (r[6] * x + r[7] * y + r[8] * z + t[2]);
    total[v] += w;
  }
  const head = world[fig.byName.head];
  for (let v = 0; v < n; v++) {
    if (total[v] < 1e-6) {
      // Vertices without weights (the eye helpers) follow the head.
      const p = apply(head.r, [rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]]);
      for (let a = 0; a < 3; a++) out[v * 3 + a] = p[a] + head.t[a];
    } else {
      for (let a = 0; a < 3; a++) out[v * 3 + a] /= total[v];
    }
  }
  return { positions: out, headRotation: head.r };
}

/** Mean of the given vertices. */
function centroid(positions, verts) {
  const c = [0, 0, 0];
  for (const v of verts) for (let a = 0; a < 3; a++) c[a] += positions[v * 3 + a];
  return c.map((x) => x / verts.length);
}

/**
 * Where the still pose stands: feet on y = 0 and the mesh centred on x and z
 * (as bodies.py placed it). Returns the shift to add to its vertices.
 */
export function stillShift(fig, positions) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < fig.meshCount; v++)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], positions[v * 3 + a]);
      hi[a] = Math.max(hi[a], positions[v * 3 + a]);
    }
  return [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2];
}

/**
 * The shift for any other pose: the feet stay where the still pose has them
 * (the body moves over them, so bent knees lower the hips), and the lowest
 * point is on the floor.
 */
export function plantedShift(fig, positions, still) {
  const here = centroid(positions, fig.feet);
  let lowest = Infinity;
  for (let v = 0; v < fig.meshCount; v++) lowest = Math.min(lowest, positions[v * 3 + 1]);
  return [still.feet[0] - here[0], -lowest, still.feet[2] - here[2]];
}

/**
 * The head's frame and size, for fitting the headphones: the head bone's
 * rotation (rows: the head's right, up and forward directions in world
 * space) and the box around the skull vertices in that frame.
 */
export function headFrame(fig, positions, rot, shift) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const v of fig.skull) {
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    // p · rot: the vertex in the head's frame.
    const l = [0, 1, 2].map((c) => p[0] * rot[c] + p[1] * rot[3 + c] + p[2] * rot[6 + c]);
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], l[a]);
      hi[a] = Math.max(hi[a], l[a]);
    }
  }
  const mid = apply(rot, [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2));
  return {
    center: mid.map((x, a) => x + shift[a]),
    size: hi.map((x, a) => x - lo[a]),
    axes: [rot.slice(0, 3), rot.slice(3, 6), rot.slice(6, 9)],
  };
}

/**
 * Poses and places a figure. Returns float32 mesh positions (feet on the
 * floor), the head frame and the figure's height. `still` (from the still
 * pose) keeps every other pose standing on the same spot.
 */
export function posed(fig, rotations, still = null) {
  const { positions, headRotation } = skin(fig, rotations);
  const shift = still ? plantedShift(fig, positions, still) : stillShift(fig, positions);
  const mesh = new Float32Array(fig.meshCount * 3);
  let height = 0;
  for (let v = 0; v < fig.meshCount; v++)
    for (let a = 0; a < 3; a++) {
      mesh[v * 3 + a] = positions[v * 3 + a] + shift[a];
      if (a === 1) height = Math.max(height, mesh[v * 3 + 1]);
    }
  // Where the feet stand once placed; other poses keep them on this spot.
  const feet = centroid(positions, fig.feet).map((x, a) => x + shift[a]);
  return { positions: mesh, head: headFrame(fig, positions, headRotation, shift), height, feet };
}

/* ── choreography ─────────────────────────────────────────────────────── */

/** The still pose: arms down, head turned a little toward the page. Euler degrees per bone. */
export const STILL = {
  man: {
    'upperarm01.L': [0, 0, -30], 'upperarm01.R': [0, 0, 30],
    'lowerarm01.L': [34, 0, 0], 'lowerarm01.R': [34, 0, 0],
    neck01: [0, 10, 0], head: [4, 14, 0],
  },
  woman: {
    'upperarm01.L': [0, 0, -32], 'upperarm01.R': [0, 0, 32],
    'lowerarm01.L': [34, 0, 0], 'lowerarm01.R': [34, 0, 0],
    neck01: [0, -10, 0], head: [4, -14, 2],
  },
};

export const stillPose = (name) => Object.fromEntries(Object.entries(STILL[name]).map(([bone, deg]) => [bone, euler(deg)]));

/*
 * The dance. Spine, neck, head and legs turn by degrees added to the still
 * pose, around the axes of the parent bone's rest frame; with the limbs
 * hanging down:
 *  - x: negative swings a thigh forward; positive tips the spine or head forward;
 *  - z: positive tilts the spine or head toward the figure's right;
 *  - y: turns the spine or head (positive toward the figure's left).
 * Arms are aimed instead: each upper arm and forearm points in a direction
 * of the figure's own space (x to its left, y up, z forward).
 */

const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
/** 1 on the beat (t = 0 and 0.5 of the two-beat loop), 0 halfway between. */
const onBeat = (t) => 0.5 + 0.5 * Math.cos(4 * Math.PI * t);
/** +1 on the first beat, −1 on the second. */
const side = (t) => Math.cos(2 * Math.PI * t);
/** Direction between `a` and `b` (t = 0 to 1). */
const mix = (a, b, t) => unit(a.map((x, i) => x + (b[i] - x) * t));
/** Direction from `a` to `b` by way of `via` (a quadratic curve). */
const arc = (a, via, b, t) => mix(mix(a, via, t), mix(via, b, t), t);
/** A direction given for the figure's left arm, mirrored for the right one. */
const mirror = (arm, [x, y, z]) => (arm === 'L' ? [x, y, z] : [-x, y, z]);

/** The still pose plus offsets (degrees) and aimed arm segments, as a pose. */
function compose(name, offsets, aims = {}) {
  const out = {};
  for (const bone of new Set([...Object.keys(STILL[name]), ...Object.keys(offsets)])) {
    const base = STILL[name][bone] ?? [0, 0, 0];
    const add = offsets[bone] ?? [0, 0, 0];
    out[bone] = euler([base[0] + add[0], base[1] + add[1], base[2] + add[2]]);
  }
  for (const [bone, dir] of Object.entries(aims)) out[bone] = { aim: dir };
  return out;
}

/** Adds a rotation to a bone in an offsets table. */
function add(o, bone, [x, y, z]) {
  const v = (o[bone] ??= [0, 0, 0]);
  v[0] += x;
  v[1] += y;
  v[2] += z;
}

/** Bends a leg at hip, knee and ankle, foot flat: `k` degrees lowers the hips. */
function knees(o, s, k) {
  add(o, `upperleg01.${s}`, [-k, 0, 0]);
  add(o, `lowerleg01.${s}`, [2 * k, 0, 0]);
  add(o, `foot.${s}`, [-k, 0, 0]);
}

/** Shifts the hips sideways over planted feet: positive `a` moves them to the figure's right. */
function hips(o, a) {
  for (const s of ['L', 'R']) {
    add(o, `upperleg01.${s}`, [0, 0, a]);
    add(o, `foot.${s}`, [0, 0, -a]);
  }
  // The upper body leans back over the feet.
  add(o, 'spine05', [0, 0, -0.9 * a]);
  add(o, 'spine03', [0, 0, -0.5 * a]);
}

/** Arms (left-arm directions; the right arm mirrors them unless given apart). */
function arms(aims, arm, upper, fore) {
  aims[`upperarm01.${arm}`] = mirror(arm, upper);
  aims[`lowerarm01.${arm}`] = mirror(arm, fore);
}

// Arm positions, for the left arm: upper arm and forearm directions.
const GUARD = [[0.12, -0.95, 0.28], [-0.45, 0.25, 0.85]]; // elbows at the sides, forearms across the front
const PUMP = [[0.12, 0.6, 0.8], [-0.05, 1, 0.2]]; // hand punched up into the air
const FORWARD = [[0.05, 0.4, 0.9], [-0.45, 0.75, 0.5]]; // hands in front of the face, on the way up
const HANDS_UP = [[0.38, 0.92, 0.12], [-0.15, 1, 0.15]]; // a V over the head, elbows soft
const REACH = [[0.28, 0.95, 0.08], [-0.3, 1, 0.08]]; // up high, elbows bent, hands close

/**
 * The man's loop: a bounce on every beat (knees, a nod, a lean in) and an
 * alternating fist pump, right fist on the first beat and left on the second.
 */
function manLoop(t) {
  const o = {};
  const aims = {};
  const b = onBeat(t);
  const s = side(t);
  knees(o, 'L', 8 + 20 * b);
  knees(o, 'R', 8 + 20 * b);
  hips(o, 4 * s);
  add(o, 'spine04', [6 * b, 4 * s, 0]);
  add(o, 'neck01', [6 * b, 0, 0]);
  add(o, 'head', [12 * b - 4, 0, 0]);
  for (const [arm, pump] of [['R', Math.max(0, s)], ['L', Math.max(0, -s)]]) {
    const p = ease(pump);
    arms(aims, arm, mix(GUARD[0], PUMP[0], p), mix(GUARD[1], PUMP[1], p));
  }
  return { o, aims };
}

/**
 * The woman's loop: hips sway from side to side over planted feet, the free
 * knee dips on each beat, and both hands are up, swaying with her.
 */
function womanLoop(t) {
  const o = {};
  const aims = {};
  const b = onBeat(t);
  const s = side(t);
  hips(o, 10 * s);
  // Weight on one foot: the other knee bends more.
  knees(o, 'L', 6 + 12 * b * Math.max(0, s));
  knees(o, 'R', 6 + 12 * b * Math.max(0, -s));
  add(o, 'spine02', [3 * b, 0, -3 * s]);
  add(o, 'head', [5 * b, 0, 8 * s]);
  // The V leans toward the side her hips are swinging from.
  const lean = [0.4 * s, 0, 0];
  for (const arm of ['L', 'R']) {
    const [up, fore] = HANDS_UP;
    const sway = arm === 'L' ? lean : [-lean[0], 0, 0];
    arms(aims, arm, unit(up.map((x, i) => x + sway[i] * 0.5)), unit(fore.map((x, i) => x + sway[i])));
  }
  return { o, aims };
}

const LOOPS = { man: manLoop, woman: womanLoop };

/** Pose `t` (0 to 1) of a figure's two-beat dance loop; t = 0 is on the beat. */
export function dancePose(name, t) {
  const { o, aims } = LOOPS[name](t);
  return compose(name, o, aims);
}

/**
 * Pose `t` (0 to 1) of the move done when the song changes: a full spin, the
 * man one way and the woman the other, rising up with the hands stretched
 * high as they turn and dipping the knees into and out of it. Returns the
 * pose and `spin`, the extra turn of the whole figure in radians.
 */
export function movePose(name, t) {
  const up = Math.sin(Math.PI * t);
  const o = {};
  const aims = {};
  knees(o, 'L', 22 * (1 - up));
  knees(o, 'R', 22 * (1 - up));
  add(o, 'head', [-8 * up, 0, 0]);
  for (const arm of ['L', 'R']) {
    // The man's arms come up in front of him (not out to the sides, where the frame ends).
    if (name === 'man') arms(aims, arm, arc(GUARD[0], FORWARD[0], REACH[0], up), arc(GUARD[1], FORWARD[1], REACH[1], up));
    else arms(aims, arm, mix(HANDS_UP[0], REACH[0], up), mix(HANDS_UP[1], REACH[1], up));
  }
  return { rotations: compose(name, o, aims), spin: (name === 'man' ? -1 : 1) * 2 * Math.PI * ease(t) };
}
