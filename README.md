# COMP4422 M2 — UV Texturing & Animation (WebGL2)

Milestone 2 builds directly on the M1 scene. The geometry, indexed drawing, camera and
depth test are unchanged; M2 upgrades the shading pipeline to **GLSL ES 3.00**, uploads a
**UV texture** to the GPU, samples it in the fragment shader, and drives the model matrices
from a **delta-time animation loop**.

The renderer is still raw WebGL2 with the team's own `Vec3` / `Mat4` library — no Three.js
or other scene framework.

## What M2 adds

| M2 requirement | Implementation |
|----------------|----------------|
| GLSL ES 3.00 shaders on a WebGL2 context | `#version 300 es`, `in`/`out`, `texture()`, `out vec4 outColor` in [js/main.js](js/main.js) |
| UV buffer uploaded to the GPU and bound as an attribute | attribute location 2 (`vec2 aUV`) in [js/mesh.js](js/mesh.js); `vt` data forwarded by [js/obj-loader.js](js/obj-loader.js) |
| Texture upload function | [js/texture.js](js/texture.js): `loadTexture`, `createTextureFromImage`, `createWhiteTexture` |
| Filtering / wrap / mipmaps / sampler binding | `REPEAT` wrap, `LINEAR_MIPMAP_LINEAR`, `generateMipmap`, anisotropic filtering, `uTexture` sampler on unit 0 |
| Visible UV texture mapping | 1024×1024 UV checker on the loaded `torus-knot.obj` (hero) and on the three cubes |
| `requestAnimationFrame` + delta-time animation | `frame(now)` in [js/main.js](js/main.js) accumulates clamped `dt`; model matrices change every frame (orbit, spin, bob, scale pulse) |
| Camera remains controllable | WASD / drag / arrows / wheel, independent of the animated model matrices |
| M1 features preserved | indexed `drawElements`, procedural cube/plane/grid, loaded `.obj`, perspective camera, depth test, main scene |

## Run it

Node.js LTS (tested with **Node v24.22.1 / npm 11.19.1**) is required for the zero-dependency
dev server. There is no build step and no npm dependency to install.

```bash
cd COMP4422Grp12
node server.js
# open http://localhost:8000
```

`npm start` runs the same server. Alternatives: `python -m http.server 8000`, or the VS Code
Live Server extension. A local HTTP server is required because ES modules and the `.obj`
fetch do not work from `file://`.

## Controls

| Input | Action |
|-------|--------|
| Drag mouse | look around |
| W / S | move forward / back |
| A / D | strafe left / right |
| Q / E (or Space) | move up / down |
| Arrow keys | turn / tilt |
| Mouse wheel | change field of view |
| Shift | move faster |

## Texture provenance and licence

- File: [`assets/textures/uv-checker-1024.png`](assets/textures/uv-checker-1024.png)
- Size / format: 1024×1024 PNG (power of two, so mipmaps are always valid)
- Author: COMP4422 Group 12 — generated for this project by
  [`tools/generate_texture.py`](tools/generate_texture.py)
- Contents: checkerboard, orientation bands, grid, corner markers and a centre label; it is
  deliberately asymmetric so UV rotation/mirroring is easy to spot.
- Third-party imagery: **none**. No image was downloaded or copied from the internet.
- Licence: dedicated to the public domain under **CC0 1.0** (project-owned work).
  See [`assets/textures/README.md`](assets/textures/README.md) for details and the exact
  regeneration command.

### UV orientation / handedness

The texture upload uses `UNPACK_FLIP_Y_WEBGL` so `v = 0` is the bottom of the image (the
GL convention). Cube UVs are generated from each face's outward normal (`u = right`,
`v = up`), so the label reads correctly from outside on all six faces. The generated
`torus-knot.obj` UVs are left-handed relative to its outward normal, so the loader flips
`u` (`loadObj(..., { flipU: true })`) to avoid mirrored text; without that flip the checker
still renders but labels read backwards.

The same OBJ is wound clockwise as seen from outside, so the loader also flips the triangle
winding (`flipWinding: true`) and the renderer enables back-face culling. This prevents the
inside of the closed tube from being drawn, and makes the "outside" well defined. The ground
plane's two triangles were likewise reordered to be CCW from above.

## Verification

Tested with Microsoft Edge 155 / headless WebGL2 and Node 24 LTS. Open DevTools and check:

- HUD shows `WebGL2 / GLSL ES 3.00`, `texture 1024x1024`, `UV floats @2: 10240`, `depth test: ON`.
- The torus knot and cubes show the checker texture, not a flat colour.
- The knot rotates and the cubes orbit/pulse; the `t=` and fps values update.
- W/A/S/D, mouse drag, arrows and the wheel move the camera without stopping the animation.
- The console has no errors; `window.__M2__.diagnostics()` returns `glError: 0` and `cullFaceEnabled: true`.

No test scripts are required to run the project.

## Project layout

```
COMP4422Grp12/
├── index.html                 entry page + HUD
├── server.js                  zero-dependency dev server
├── package.json               type: module, npm start
├── assets/
│   ├── torus-knot.obj         generated (2,3) torus knot, 5120 verts / 10240 tris, vt + vn
│   └── textures/
│       ├── uv-checker-1024.png
│       └── README.md          provenance + licence
├── js/
│   ├── math.js                Vec3 + Mat4 (multiply, perspective, lookAt, rotations, …)
│   ├── camera.js              controllable perspective camera
│   ├── mesh.js                VAO-backed indexed mesh; position/normal/UV attributes
│   ├── primitives.js          procedural cube / plane / grid (UVs on cube + plane)
│   ├── obj-loader.js          .obj parser; forwards v/vt/vn, optional UV/winding fix
│   ├── texture.js             M2 texture upload, filtering, wrap, mipmaps
│   └── main.js                scene, GLSL ES 3.00 shaders, animation loop, input
└── tools/
    └── generate_texture.py    regenerates the UV checker asset
```

## M1 notes kept for reference

- The solid shader still uses simple diffuse + a small specular term so shapes read clearly.
  Full Blinn-Phong lighting and shadows are intentionally left for M3.
- All matrices are column-major and computed with the team's own library.
- The `.obj` loader supports `v/vt/vn`, `v`, `v/vt`, `v//vn`, n-gons and negative indices.

## Known limitations

- The checker texture is used on every face of the cube, so the centre label is compressed on
  small cube faces; the torus knot is the intended close-up texture demo.
- The `torus-knot.obj` UVs repeat the texture eight times along the knot (`u = 0..8`), so the
  label appears repeatedly and wraps around the tube; this is the OBJ's UV parametrisation.
