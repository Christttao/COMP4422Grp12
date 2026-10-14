// main.js — COMP4422 M1 scene: raw WebGL2, own Vec3/Mat4 library, indexed meshes
// (including a loaded .obj), model-view-projection with a perspective camera,
// depth test enabled, and a controllable camera.

import { Vec3, Mat4 } from './math.js';
import { Camera } from './camera.js';
import { createCubeMesh, createPlaneMesh, createGridMesh } from './primitives.js';
import { loadObj } from './obj-loader.js';

const canvas = document.getElementById('glcanvas');
const errorBox = document.getElementById('error');
const infoBox = document.getElementById('info');

const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) {
  showError('WebGL2 is not supported by this browser/device.\nPlease use a recent Chrome, Edge or Firefox.');
  throw new Error('WebGL2 unavailable');
}

// ---------------------------------------------------------------- shaders
const SOLID_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uMVP;
out vec3 vNormal;
out vec3 vWorldPos;
void main() {
  vNormal = mat3(uModel) * aNormal;
  vWorldPos = (uModel * vec4(aPosition, 1.0)).xyz;
  gl_Position = uMVP * vec4(aPosition, 1.0);
}`;

const SOLID_FS = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorldPos;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  // Simple headlight shading so 3D shapes read clearly. Proper lighting is M3.
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.4, 0.9, 0.5));
  float diff = max(dot(N, L), 0.0);
  outColor = vec4(uColor * (0.3 + 0.7 * diff), 1.0);
}`;

const LINE_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uMVP;
void main() {
  gl_Position = uMVP * vec4(aPosition, 1.0);
}`;

const LINE_FS = `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  outColor = vec4(uColor, 1.0);
}`;

const solidProg = createProgram(gl, SOLID_VS, SOLID_FS);
const lineProg = createProgram(gl, LINE_VS, LINE_FS);

const solidU = {
  model: gl.getUniformLocation(solidProg, 'uModel'),
  mvp: gl.getUniformLocation(solidProg, 'uMVP'),
  color: gl.getUniformLocation(solidProg, 'uColor'),
};
const lineU = {
  mvp: gl.getUniformLocation(lineProg, 'uMVP'),
  color: gl.getUniformLocation(lineProg, 'uColor'),
};

// ---------------------------------------------------------------- GL state
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LESS);
gl.clearColor(0.07, 0.08, 0.12, 1);

// ---------------------------------------------------------------- meshes
const cubeMesh = createCubeMesh(gl, 1);
const planeMesh = createPlaneMesh(gl, 50);
const gridMesh = createGridMesh(gl, 50, 25);

const camera = new Camera({ position: new Vec3(0, 3, 9) });

// A small orbiting helper used by the animated objects.
function orbit(r, y, t, phase) {
  return new Vec3(Math.cos(t * 0.6 + phase) * r, y, Math.sin(t * 0.6 + phase) * r);
}

async function main() {
  let knotMesh = null;
  try {
    knotMesh = await loadObj(gl, 'assets/torus-knot.obj');
  } catch (err) {
    console.error(err);
    showError('Could not load assets/torus-knot.obj.\n' +
      'Run the project through a local HTTP server (see README.md), e.g.:\n' +
      '  node server.js   or   python -m http.server 8000');
  }

  const objects = [
    { mesh: knotMesh, color: [0.95, 0.75, 0.20], getState: (t) => ({ pos: new Vec3(0, 2.4, 0), rotY: t * 0.8, rotX: 0, scale: 1 }) },
    { mesh: cubeMesh, color: [0.90, 0.35, 0.30], getState: (t) => ({ pos: orbit(4.2, 0.7, t, 0), rotY: t, rotX: 0, scale: 0.7 }) },
    { mesh: cubeMesh, color: [0.35, 0.85, 0.50], getState: (t) => ({ pos: orbit(4.2, 0.7, t, Math.PI * 2 / 3), rotY: -t, rotX: 0, scale: 0.7 }) },
    { mesh: cubeMesh, color: [0.40, 0.55, 1.00], getState: (t) => ({ pos: orbit(4.2, 0.7, t, Math.PI * 4 / 3), rotY: t * 1.5, rotX: 0, scale: 0.7 }) },
  ];

  infoBox.textContent =
    `Loaded .obj: ${knotMesh ? knotMesh.count / 3 : 0} triangles · ` +
    `cube: ${cubeMesh.count / 3} triangles · ` +
    `grid lines: ${gridMesh.count / 2} · depth test: ON`;

  setupInput();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    updateCamera(dt);
    render(objects, t);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- rendering
function render(objects, t) {
  gl.viewport(0, 0, canvas.width, canvas.height);

  const aspect = canvas.width / canvas.height;
  const proj = camera.projectionMatrix(aspect);
  const view = camera.viewMatrix();
  const pv = Mat4.multiply(proj, view);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  drawSolid(planeMesh, [0.10, 0.12, 0.16], Mat4.identity(), pv);
  drawLine(gridMesh, [0.22, 0.26, 0.34], Mat4.identity(), pv);

  for (const obj of objects) {
    if (!obj.mesh) continue;
    const s = obj.getState(t);
    const rot = Mat4.multiply(Mat4.rotationY(s.rotY), Mat4.rotationX(s.rotX));
    const model = Mat4.multiply(Mat4.translation(s.pos.x, s.pos.y, s.pos.z), rot);
    const scaled = Mat4.multiply(model, Mat4.scaling(s.scale, s.scale, s.scale));
    drawSolid(obj.mesh, obj.color, scaled, pv);
  }
}

function drawSolid(mesh, color, model, pv) {
  gl.useProgram(solidProg);
  gl.uniformMatrix4fv(solidU.model, false, model.m);
  gl.uniformMatrix4fv(solidU.mvp, false, Mat4.multiply(pv, model).m);
  gl.uniform3fv(solidU.color, color);
  mesh.draw();
}

function drawLine(mesh, color, model, pv) {
  gl.useProgram(lineProg);
  gl.uniformMatrix4fv(lineU.mvp, false, Mat4.multiply(pv, model).m);
  gl.uniform3fv(lineU.color, color);
  mesh.draw();
}

// ---------------------------------------------------------------- camera + input
const keys = new Set();

function updateCamera(dt) {
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1;
  const dist = camera.moveSpeed * fast * dt;

  if (keys.has('KeyW')) camera.moveForward(dist);
  if (keys.has('KeyS')) camera.moveForward(-dist);
  if (keys.has('KeyA')) camera.moveRight(-dist);
  if (keys.has('KeyD')) camera.moveRight(dist);
  if (keys.has('KeyQ') || keys.has('Space')) camera.moveUp(dist);
  if (keys.has('KeyE')) camera.moveUp(-dist);

  if (keys.has('ArrowLeft')) camera.rotate(-2.0 * dt, 0);
  if (keys.has('ArrowRight')) camera.rotate(2.0 * dt, 0);
  if (keys.has('ArrowUp')) camera.rotate(0, 1.5 * dt);
  if (keys.has('ArrowDown')) camera.rotate(0, -1.5 * dt);
}

function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    camera.rotate(dx * 0.005, -dy * 0.005);
  });
  const stopDrag = () => {
    dragging = false;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.fov = Math.max(20, Math.min(120, camera.fov + e.deltaY * 0.05));
  });
}

// ---------------------------------------------------------------- helpers
function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link failed: ' + gl.getProgramInfoLog(program));
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
  }
  return shader;
}

function showError(msg) {
  errorBox.style.display = 'block';
  errorBox.textContent = msg;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}
window.addEventListener('resize', resize);
resize();

main().catch((err) => {
  console.error(err);
  showError(String(err && err.message ? err.message : err));
});
