"""
Builds the two chrome DJ figures of the Y2K Futurism look (a man and a woman,
hairless, full body) from MakeHuman's CC0 assets, and writes them as small
binary meshes to tools/y2k-art/bodies/ for tools/y2k-art/render.js.

MakeHuman's base mesh, skeleton, skin weights and shape targets were released
as CC0 1.0 in September 2020 (see LICENSE.md in makehumancommunity/makehuman),
and so are the meshes made from them. The body shapes are set the way
MakeHuman's macro sliders set them (gender, muscle, height, proportions); the
pose (arms down, head slightly turned) is applied with MakeHuman's own
skeleton and weights by linear blend skinning.

You only need this to change the figures; the built meshes are committed.

    git clone --depth 1 https://github.com/makehumancommunity/makehuman /tmp/mh-git
    pip download --no-deps makehuman==1.3.2 -d /tmp/mh-pip
    unzip -o /tmp/mh-pip/makehuman-1.3.2-py3-none-any.whl 'makehuman/data/targets.npz' -d /tmp/mh-pip
    python3 tools/y2k-art/bodies.py /tmp/mh-git/makehuman/data /tmp/mh-pip/makehuman/data/targets.npz

The git repository has the base mesh and rig; its targets are stubs, so the
compiled targets come from the PyPI package. Needs numpy.
"""

import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / 'bodies'
# Face groups of the base mesh to keep: the skin and the eyeballs.
KEEP_GROUPS = {'body', 'helper-l-eye', 'helper-r-eye'}

FIGURES = {
    'man': {
        'gender': 1.0,
        'muscle': 0.72,
        'height': 0.62,
        'proportions': 1.0,
        # Bone rotations in degrees around the world axes (x right, y up, z forward).
        'pose': {
            'upperarm01.L': (0, 0, -30), 'upperarm01.R': (0, 0, 30),
            'lowerarm01.L': (34, 0, 0), 'lowerarm01.R': (34, 0, 0),
            'neck01': (0, 10, 0), 'head': (4, 14, 0),
        },
    },
    'woman': {
        'gender': 0.0,
        'muscle': 0.55,
        'height': 0.6,
        'proportions': 1.0,
        'pose': {
            'upperarm01.L': (0, 0, -32), 'upperarm01.R': (0, 0, 32),
            'lowerarm01.L': (34, 0, 0), 'lowerarm01.R': (34, 0, 0),
            'neck01': (0, -10, 0), 'head': (4, -14, 2),
        },
    },
}


def read_obj(path):
    verts, faces, group = [], [], None
    for line in open(path):
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            group = line.split()[1]
        elif line.startswith('f ') and group in KEEP_GROUPS:
            faces.append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
    return np.array(verts, dtype=np.float64), faces


class Targets:
    def __init__(self, npz_path):
        self.z = np.load(npz_path)

    def add(self, coords, name, weight):
        if weight <= 1e-6:
            return
        key = f'targets/{name}'
        idx = self.z[key + '.index'].astype(np.int64)
        vec = self.z[key + '.vector'].astype(np.float64) * 1e-3
        coords[idx] += weight * vec


def split(value, low, mid, high):
    """MakeHuman's slider split: 0..0.5 blends low/mid, 0.5..1 blends mid/high."""
    if value < 0.5:
        return {low: 1 - value * 2, mid: value * 2}
    return {mid: 1 - (value - 0.5) * 2, high: (value - 0.5) * 2}


def shape(base, targets, fig):
    coords = base.copy()
    genders = {'male': fig['gender'], 'female': 1 - fig['gender']}
    ages = {'young': 1.0}  # age slider 0.5 = 25 years
    muscles = split(fig['muscle'], 'minmuscle', 'averagemuscle', 'maxmuscle')
    weights = {'averageweight': 1.0}
    races = {'caucasian': 1 / 3, 'african': 1 / 3, 'asian': 1 / 3}
    heights = split(fig['height'], 'minheight', None, 'maxheight')
    for g, gw in genders.items():
        for a, aw in ages.items():
            for race, rw in races.items():
                targets.add(coords, f'macrodetails/{race}-{g}-{a}', rw * gw * aw)
            for m, mw in muscles.items():
                for w, ww in weights.items():
                    base_w = gw * aw * mw * ww
                    targets.add(coords, f'macrodetails/universal-{g}-{a}-{m}-{w}', base_w)
                    for h, hw in heights.items():
                        if h:
                            targets.add(coords, f'macrodetails/height/{g}-{a}-{m}-{w}-{h}', base_w * hw)
                    targets.add(coords, f'macrodetails/proportions/{g}-{a}-{m}-{w}-idealproportions', base_w * fig['proportions'])
    return coords


def rotation(deg):
    """Rotation matrix from (x, y, z) degrees, applied in the order z, y, x."""
    x, y, z = (math.radians(d) for d in deg)
    rx = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return rx @ ry @ rz


def pose(coords, rig_dir, bone_rot):
    skel = json.load(open(rig_dir / 'default.mhskel'))
    weights = json.load(open(rig_dir / 'default_weights.mhw'))['weights']
    joints = {name: coords[idx].mean(axis=0) for name, idx in skel['joints'].items()}
    bones = skel['bones']

    # World transform of each bone (4x4), parents first.
    world = {}

    def transform(name):
        if name in world:
            return world[name]
        b = bones[name]
        parent = transform(b['parent']) if b['parent'] else np.eye(4)
        local = np.eye(4)
        if name in bone_rot:
            head = joints[b['head']]
            r = rotation(bone_rot[name])
            local[:3, :3] = r
            local[:3, 3] = head - r @ head
        world[name] = parent @ local
        return world[name]

    for name in bones:
        transform(name)

    homo = np.hstack([coords, np.ones((len(coords), 1))])
    out = np.zeros_like(coords)
    total = np.zeros(len(coords))
    for name, pairs in weights.items():
        if not pairs:
            continue
        idx = np.array([p[0] for p in pairs])
        w = np.array([p[1] for p in pairs])
        moved = (homo[idx] @ world[name].T)[:, :3]
        np.add.at(out, idx, moved * w[:, None])
        np.add.at(total, idx, w)
    # Vertices without weights (e.g. the eye helpers) follow the head.
    unweighted = total < 1e-6
    out[unweighted] = (homo[unweighted] @ world['head'].T)[:, :3]
    total[unweighted] = 1
    posed = out / total[:, None]

    # The head's frame and size, for fitting the headphones: rotation of the
    # head bone, and the box around the skull vertices in that frame.
    rot = world['head'][:3, :3]
    head_idx = np.array([i for i, w in weights['head'] if w > 0.9])
    local = posed[head_idx] @ rot
    lo, hi = local.min(axis=0), local.max(axis=0)
    head = {'axes': rot, 'center': rot @ ((lo + hi) / 2), 'size': hi - lo}
    # Where the lightning in the page can start: fingertips and toes, posed.
    for key, bone in [('handL', 'finger3-3.L'), ('handR', 'finger3-3.R'), ('footL', 'foot.L'), ('footR', 'foot.R')]:
        tail = np.append(joints[bones[bone]['tail']], 1)
        head[key] = (world[bone] @ tail)[:3]
    return posed, head


def write_mesh(path, coords, faces, head):
    used = sorted({i for f in faces for i in f})
    remap = {old: new for new, old in enumerate(used)}
    tris = []
    for f in faces:
        f = [remap[i] for i in f]
        tris += [f[0], f[1], f[2]]
        if len(f) == 4:
            tris += [f[0], f[2], f[3]]
    pos = coords[used].astype(np.float32)
    # Feet on y = 0, centred on x and z.
    pos[:, 1] -= pos[:, 1].min()
    pos[:, 0] -= (pos[:, 0].min() + pos[:, 0].max()) / 2
    pos[:, 2] -= (pos[:, 2].min() + pos[:, 2].max()) / 2
    shift = pos[0] - coords[used[0]].astype(np.float32)
    meta = {
        'height': float(pos[:, 1].max()),
        'head': {
            'center': [round(float(v), 4) for v in head['center'] + shift],
            'size': [round(float(v), 4) for v in head['size']],
            # Columns: the head's right, up and forward directions.
            'axes': [[round(float(v), 5) for v in row] for row in head['axes']],
        },
        'anchors': {k: [round(float(v), 4) for v in head[k] + shift] for k in ('handL', 'handR', 'footL', 'footR')},
    }
    path.with_suffix('.json').write_text(json.dumps(meta, indent=2) + '\n')
    idx = np.array(tris, dtype=np.uint16 if len(used) < 65536 else np.uint32)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<II', len(pos), len(idx)))
        fh.write(pos.tobytes())
        fh.write(idx.astype(np.uint16).tobytes())
    print(f'{path.name}: {len(pos)} vertices, {len(idx) // 3} triangles, {path.stat().st_size / 1024:.0f} KB')


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    data_dir, npz = Path(sys.argv[1]), Path(sys.argv[2])
    base, faces = read_obj(data_dir / '3dobjs' / 'base.obj')
    targets = Targets(npz)
    OUT.mkdir(exist_ok=True)
    for name, fig in FIGURES.items():
        coords = shape(base, targets, fig)
        coords, head = pose(coords, data_dir / 'rigs', fig['pose'])
        write_mesh(OUT / f'{name}.bin', coords, faces, head)


if __name__ == '__main__':
    main()
