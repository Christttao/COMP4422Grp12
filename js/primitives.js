// primitives.js — Procedurally built indexed meshes (cube, ground plane, wire grid).

import { Mesh } from './mesh.js';

// Axis-aligned unit cube with correct per-face normals (24 vertices, 36 indices).
export function createCubeMesh(gl, size = 1) {
  const h = size / 2;
  const faces = [
    { n: [1, 0, 0],  p: [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]] },
    { n: [-1, 0, 0], p: [[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]] },
    { n: [0, 1, 0],  p: [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]] },
    { n: [0, -1, 0], p: [[-h, -h, h], [-h, -h, -h], [h, -h, -h], [h, -h, h]] },
    { n: [0, 0, 1],  p: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]] },
    { n: [0, 0, -1], p: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]] },
  ];

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (const face of faces) {
    const base = positions.length / 3;
    // Build UVs from the outward normal so the texture reads the same way from
    // outside on every face. For side faces: u = right (= up x normal), v = +Y.
    // Top/bottom need a chosen "north" direction because up x normal is zero.
    const n = face.n;
    let right;
    let vAxis;
    if (n[1] > 0.5) {
      right = [1, 0, 0];
      vAxis = [0, 0, -1];
    } else if (n[1] < -0.5) {
      right = [1, 0, 0];
      vAxis = [0, 0, 1];
    } else {
      right = [n[2], 0, -n[0]];
      vAxis = [0, 1, 0];
    }

    face.p.forEach((p) => {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      const u = ((p[0] * right[0] + p[1] * right[1] + p[2] * right[2]) / h + 1) * 0.5;
      const v = ((p[0] * vAxis[0] + p[1] * vAxis[1] + p[2] * vAxis[2]) / h + 1) * 0.5;
      uvs.push(u, v);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return new Mesh(gl, { positions, normals, uvs, indices });
}

// Flat ground plane on y = 0 (two triangles).
export function createPlaneMesh(gl, size = 50) {
  const h = size / 2;
  return new Mesh(gl, {
    positions: [-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    // CCW when viewed from +Y (above), so back-face culling keeps the ground.
    indices: [0, 2, 1, 0, 3, 2],
  });
}

// Wireframe grid on y = 0, drawn with gl.LINES.
export function createGridMesh(gl, size = 50, divisions = 25) {
  const h = size / 2;
  const step = size / divisions;
  const positions = [];
  const indices = [];
  let vi = 0;
  for (let i = 0; i <= divisions; i++) {
    const c = -h + i * step;
    positions.push(-h, 0, c, h, 0, c); // line along X
    indices.push(vi, vi + 1);
    vi += 2;
    positions.push(c, 0, -h, c, 0, h); // line along Z
    indices.push(vi, vi + 1);
    vi += 2;
  }

  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < positions.length / 3; i++) normals[i * 3 + 1] = 1;
  return new Mesh(gl, { positions, normals, indices, mode: gl.LINES });
}
