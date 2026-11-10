# Chrome DJ meshes

`man.bin` and `woman.bin` are the full-body figures behind `npm run art:y2k -- man woman` (standing)
and `npm run art:y2k -- man-dance woman-dance` (dancing), built by `../bodies.py` from MakeHuman's base
mesh, shape targets, skeleton and skin weights. Those assets were released as CC0 1.0 in September
2020 (github.com/makehumancommunity/makehuman, LICENSE.md, sections C and D), and so are these meshes.

They are skinned meshes in MakeHuman's rest pose; `../pose.js` poses them (linear blend skinning).
Format of the `.bin` (little endian): five `uint32` counts (vertices, mesh vertices, indices,
weights, skull vertices), then `float32 x, y, z` per vertex (decimetres, facing +z; the mesh
vertices first, then skull vertices of helper geometry that only the headphone fit measures),
`float32` weights, `uint16` triangle indices, `uint16` vertex of each weight, `uint16` skull
vertices and `uint8` bone of each weight. The `.json` next to each lists the bones, parents
first: name, parent index, and the head and tail joint positions.
