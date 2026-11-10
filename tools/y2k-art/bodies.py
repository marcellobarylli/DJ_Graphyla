"""
Builds the two chrome DJ figures of the Y2K Futurism look (a man and a woman,
hairless, full body) from MakeHuman's CC0 assets, and writes them as small
binary skinned meshes to tools/y2k-art/bodies/ for tools/y2k-art/render.js.

MakeHuman's base mesh, skeleton, skin weights and shape targets were released
as CC0 1.0 in September 2020 (see LICENSE.md in makehumancommunity/makehuman),
and so are the meshes made from them. The body shapes are set the way
MakeHuman's macro sliders set them (gender, muscle, height, proportions). The
figures are written in MakeHuman's rest pose with its skeleton and skin
weights; the poses (standing still, the dance, the spin) are applied by
tools/y2k-art/pose.js with linear blend skinning.

You only need this to change the body shapes; the built meshes are committed.

    git clone --depth 1 https://github.com/makehumancommunity/makehuman /tmp/mh-git
    pip download --no-deps makehuman==1.3.2 -d /tmp/mh-pip
    unzip -o /tmp/mh-pip/makehuman-1.3.2-py3-none-any.whl 'makehuman/data/targets.npz' -d /tmp/mh-pip
    python3 tools/y2k-art/bodies.py /tmp/mh-git/makehuman/data /tmp/mh-pip/makehuman/data/targets.npz

The git repository has the base mesh and rig; its targets are stubs, so the
compiled targets come from the PyPI package. Needs numpy.
"""

import json
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
    },
    'woman': {
        'gender': 0.0,
        'muscle': 0.55,
        'height': 0.6,
        'proportions': 1.0,
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


def rig(coords, faces, rig_dir):
    """The figure as a skinned mesh: its shaped rest vertices, MakeHuman's
    bones (head and tail joints, parents first) and the skin weights.
    tools/y2k-art/pose.js poses it (linear blend skinning)."""
    skel = json.load(open(rig_dir / 'default.mhskel'))
    weights = json.load(open(rig_dir / 'default_weights.mhw'))['weights']
    joints = {name: coords[idx].mean(axis=0) for name, idx in skel['joints'].items()}
    bones = skel['bones']

    # Mesh vertices first (the ones the triangles use), then the skull
    # vertices of helper geometry that the headphones fit also measures.
    used = sorted({i for f in faces for i in f})
    kept = set(used)
    skull = [i for i, w in weights['head'] if w > 0.9]
    order = used + [i for i in skull if i not in kept]
    remap = {old: new for new, old in enumerate(order)}

    # Bones that move any of these vertices, and their ancestors, parents first.
    needed = set()
    for name, pairs in weights.items():
        if any(i in remap for i, _ in pairs):
            while name and name not in needed:
                needed.add(name)
                name = bones[name]['parent']
    names = []

    def visit(name):
        if name in names:
            return
        parent = bones[name]['parent']
        if parent:
            visit(parent)
        names.append(name)

    for name in bones:
        if name in needed:
            visit(name)
    index = {name: i for i, name in enumerate(names)}

    influences = [(remap[i], index[name], w) for name, pairs in weights.items() for i, w in pairs if i in remap]
    tris = []
    for f in faces:
        f = [remap[i] for i in f]
        tris += [f[0], f[1], f[2]]
        if len(f) == 4:
            tris += [f[0], f[2], f[3]]
    return {
        'positions': coords[order],
        'mesh_count': len(used),
        'triangles': tris,
        'influences': influences,
        'skull': [remap[i] for i in skull],
        'bones': [
            {
                'name': name,
                'parent': index[bones[name]['parent']] if bones[name]['parent'] else None,
                'head': [round(float(v), 5) for v in joints[bones[name]['head']]],
                'tail': [round(float(v), 5) for v in joints[bones[name]['tail']]],
            }
            for name in names
        ],
    }


def write_rig(path, r):
    pos = r['positions'].astype(np.float32)
    inf = r['influences']
    assert len(pos) < 65536 and len(r['bones']) < 256
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<IIIII', len(pos), r['mesh_count'], len(r['triangles']), len(inf), len(r['skull'])))
        fh.write(pos.tobytes())
        fh.write(np.array([w for _, _, w in inf], dtype=np.float32).tobytes())
        fh.write(np.array(r['triangles'], dtype=np.uint16).tobytes())
        fh.write(np.array([v for v, _, _ in inf], dtype=np.uint16).tobytes())
        fh.write(np.array(r['skull'], dtype=np.uint16).tobytes())
        fh.write(np.array([b for _, b, _ in inf], dtype=np.uint8).tobytes())
    lines = ',\n'.join('  ' + json.dumps(b, separators=(',', ':')) for b in r['bones'])
    path.with_suffix('.json').write_text('{"bones": [\n' + lines + '\n]}\n')
    print(f'{path.name}: {len(pos)} vertices ({r["mesh_count"]} in the mesh), {len(r["triangles"]) // 3} triangles, '
          f'{len(r["bones"])} bones, {len(inf)} weights, {path.stat().st_size / 1024:.0f} KB')


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    data_dir, npz = Path(sys.argv[1]), Path(sys.argv[2])
    base, faces = read_obj(data_dir / '3dobjs' / 'base.obj')
    targets = Targets(npz)
    OUT.mkdir(exist_ok=True)
    for name, fig in FIGURES.items():
        write_rig(OUT / f'{name}.bin', rig(shape(base, targets, fig), faces, data_dir / 'rigs'))


if __name__ == '__main__':
    main()
