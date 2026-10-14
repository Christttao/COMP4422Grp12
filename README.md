# COMP4422 M1 — Geometry & Camera (WebGL2)

Milestone 1 for the COMP4422 Computer Graphics project: an animated 3D scene built with
**raw WebGL2** and a **hand-written Vec3/Mat4 math library**.

## M1 requirements → where they are implemented

| Requirement | Implementation |
|-------------|----------------|
| Own `Vec3` / `Mat4` library | [js/math.js](js/math.js) |
| Indexed meshes drawn with `drawElements` | [js/mesh.js](js/mesh.js) + [js/primitives.js](js/primitives.js) (cube, ground plane, wire grid) |
| A loaded `.obj` file | [js/obj-loader.js](js/obj-loader.js) + [assets/torus-knot.obj](assets/torus-knot.obj) |
| Model–View–Projection with a perspective camera | [js/camera.js](js/camera.js) (`perspective` + `lookAt`) and [js/main.js](js/main.js) |
| Depth test on | `gl.enable(gl.DEPTH_TEST)` in [js/main.js](js/main.js) |
| Controllable camera | [js/camera.js](js/camera.js) + input handling in [js/main.js](js/main.js) |

## Run it

A local HTTP server is required (the `.obj` is fetched over HTTP, and the app uses ES modules).

```bash
cd M1
node server.js
# then open http://localhost:8000
```

Alternatives:
- `python -m http.server 8000` (then open http://localhost:8000)
- VS Code "Live Server" extension on `index.html`

## Controls

| Input | Action |
|-------|--------|
| Drag mouse | look around |
| W / S | move forward / back |
| A / D | strafe left / right |
| Q / E | move up / down |
| Arrow keys | turn / tilt |
| Mouse wheel | change field of view |
| Shift | move faster |

## Project layout

```
M1/
├── index.html          entry page + HUD
├── server.js           zero-dependency dev server
├── package.json        type: module, `npm start`
├── assets/
│   └── torus-knot.obj  generated (2,3) torus knot (5120 verts, 10240 triangles)
└── js/
    ├── math.js         Vec3 + Mat4 (multiply, perspective, lookAt, rotations, transpose, inverse)
    ├── camera.js       controllable perspective camera (front/right/view/projection)
    ├── mesh.js         VAO-backed indexed mesh drawn with drawElements
    ├── primitives.js   procedural cube / plane / grid meshes
    ├── obj-loader.js   .obj parser (v/vt/vn, f as v, v/vt, v//vn, v/vt/vn, n-gons, negatives)
    └── main.js         scene, shaders, render loop, input
```

## Notes

- The solid shader uses a simple headlight term only so shapes are readable; full
  Blinn-Phong lighting is intentionally left for **M3**.
- Textures are intentionally left for **M2** (the loader already parses `vt`, so UVs are ready).
- All matrices are column-major and computed with the team's own library — no Three.js or similar.

## Recording your M1 milestone video (≤ 3 min)

Suggested structure:
1. **Run + result** (~60 s): show the scene animating; orbit/dolly with W/S + drag;
   zoom with the wheel; point out the loaded `.obj` (the gold torus knot), the cubes,
   the ground grid, and that objects occlude correctly thanks to the depth test.
2. **Key code** (~2 min), screen-share the editor and explain:
   - `js/math.js` — `Mat4.perspective`, `Mat4.lookAt`, `Mat4.multiply`.
   - `js/main.js` — `MVP = Projection × View × Model`, `drawElements`, `DEPTH_TEST`.
   - `js/obj-loader.js` — parsing `v/vt/vn` and `f` into an indexed mesh.
   - `js/camera.js` — front/right vectors and the controllable camera.
3. State your name/ID and that this is **M1 (Member A)**.
