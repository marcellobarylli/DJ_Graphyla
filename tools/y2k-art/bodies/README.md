# Chrome DJ meshes

`man.bin` and `woman.bin` are the full-body figures behind `npm run art:y2k -- man woman`,
built by `../bodies.py` from MakeHuman's base mesh, shape targets, skeleton and skin
weights. Those assets were released as CC0 1.0 in September 2020
(github.com/makehumancommunity/makehuman, LICENSE.md, sections C and D), and so are
these meshes.

Format (little endian): `uint32 vertexCount`, `uint32 indexCount`, then
`float32 x, y, z` per vertex (decimetres, feet on y = 0, facing +z), then `uint16`
triangle indices. The `.json` next to each holds the figure's height and its head's
frame and size, used to fit the headphones.
