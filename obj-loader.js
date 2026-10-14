// obj-loader.js — A small Wavefront .obj parser + loader that produces indexed geometry.
//
// Supports:  v / vt / vn records, f lines of the forms "v", "v/vt", "v//vn" and
// "v/vt/vn", negative (relative) indices, and n-gon faces (triangulated as a fan).
// Vertices are de-duplicated so the result is a true indexed mesh.

import { Mesh } from './mesh.js';

export function parseObj(text) {
  const rawPos = [];
  const rawUv = [];
  const rawNrm = [];
  const positions = [];
  const uvs = [];
  const normals = [];
  const indices = [];
  const cache = new Map();

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line[0] === '#') continue;
    const t = line.split(/\s+/);

    switch (t[0]) {
      case 'v':
        rawPos.push([parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3])]);
        break;
      case 'vt':
        rawUv.push([parseFloat(t[1]), parseFloat(t[2] ?? '0')]);
        break;
      case 'vn':
        rawNrm.push([parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3])]);
        break;
      case 'f': {
        const face = t.slice(1);
        for (let i = 1; i + 1 < face.length; i++) {
          indices.push(addVertex(face[0], rawPos, rawUv, rawNrm, positions, uvs, normals, cache));
          indices.push(addVertex(face[i], rawPos, rawUv, rawNrm, positions, uvs, normals, cache));
          indices.push(addVertex(face[i + 1], rawPos, rawUv, rawNrm, positions, uvs, normals, cache));
        }
        break;
      }
      default:
        break;
    }
  }

  // Fall back to flat face normals when the file provides none.
  if (rawNrm.length === 0) computeFlatNormals(positions, indices, normals);

  return { positions, normals, uvs, indices };
}

function addVertex(token, rawPos, rawUv, rawNrm, positions, uvs, normals, cache) {
  const cached = cache.get(token);
  if (cached !== undefined) return cached;

  const parts = token.split('/');
  const pi = resolveIndex(parseInt(parts[0], 10), rawPos.length);
  const pos = rawPos[pi];

  let u = 0, v = 0;
  if (parts[1] !== undefined && parts[1] !== '') {
    const ti = resolveIndex(parseInt(parts[1], 10), rawUv.length);
    u = rawUv[ti][0];
    v = rawUv[ti][1];
  }

  let nx = 0, ny = 0, nz = 0;
  if (parts[2] !== undefined && parts[2] !== '') {
    const ni = resolveIndex(parseInt(parts[2], 10), rawNrm.length);
    nx = rawNrm[ni][0];
    ny = rawNrm[ni][1];
    nz = rawNrm[ni][2];
  }

  positions.push(pos[0], pos[1], pos[2]);
  uvs.push(u, v);
  normals.push(nx, ny, nz);

  const index = positions.length / 3 - 1;
  cache.set(token, index);
  return index;
}

// OBJ indices are 1-based; negative values count backwards from the end.
function resolveIndex(i, length) {
  return i > 0 ? i - 1 : length + i;
}

function computeFlatNormals(positions, indices, normals) {
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;

    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];

    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    for (const k of [a, b, c]) {
      normals[k] = nx;
      normals[k + 1] = ny;
      normals[k + 2] = nz;
    }
  }
}

// Fetch and parse a .obj file, returning a ready-to-draw Mesh.
export async function loadObj(gl, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  const text = await res.text();
  const data = parseObj(text);
  return new Mesh(gl, {
    positions: data.positions,
    normals: data.normals,
    indices: data.indices,
  });
}
