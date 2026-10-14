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
  const indices = [];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const p of face.p) {
      positions.push(p[0], p[1], p[2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return new Mesh(gl, { positions, normals, indices });
}

// Flat ground plane on y = 0 (two triangles).
export function createPlaneMesh(gl, size = 50) {
  const h = size / 2;
  return new Mesh(gl, {
    positions: [-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 0, 2, 3],
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
