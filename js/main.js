// main.js — COMP4422 M2 scene: raw WebGL2, own Vec3/Mat4 library, indexed meshes,
// a loaded .obj with UV texture mapping, a controllable perspective camera,
// depth test, and a requestAnimationFrame animation loop driven by delta time.
//
// M1 features (geometry, indexed drawElements, camera, depth test, scene) are
// preserved; M2 adds GLSL ES 3.00 texture sampling, a UV vertex attribute and
// explicit per-frame model-matrix animation.

import { Vec3, Mat4 } from './math.js';
import { Camera } from './camera.js';
import { createCubeMesh, createPlaneMesh, createGridMesh } from './primitives.js';
import { loadObj } from './obj-loader.js';
import { loadTexture, createWhiteTexture } from './texture.js';

const TEXTURE_URL = 'assets/textures/uv-checker-1024.png';

const canvas = document.getElementById('glcanvas');
const errorBox = document.getElementById('error');
const infoBox = document.getElementById('info');

const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) {
  showError('WebGL2 is not supported by this browser/device.\nPlease use a recent Chrome, Edge or Firefox.');
  throw new Error('WebGL2 unavailable');
}

// ---------------------------------------------------------------- shaders
// M2: GLSL ES 3.00, `in`/`out`, a vec2 UV attribute, `texture()` and an explicit
// fragment output. The vertex stage still computes world position and normal so
// the M1-style shading is retained.
const TEXTURED_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uMVP;

out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;

void main() {
  vNormal = mat3(uModel) * aNormal;
  vWorldPos = (uModel * vec4(aPosition, 1.0)).xyz;
  vUV = aUV;
  gl_Position = uMVP * vec4(aPosition, 1.0);
}`;

const TEXTURED_FS = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;

uniform sampler2D uTexture;
uniform float uTexMix;      // 1 = fully textured, 0 = flat colour
uniform vec3 uColor;        // albedo tint (also keeps M1's per-object colours)
uniform vec3 uLightDir;
uniform vec3 uCameraPos;
uniform float uShininess;

out vec4 outColor;

void main() {
  vec4 texel = texture(uTexture, vUV);
  vec3 albedo = uColor * mix(vec3(1.0), texel.rgb, uTexMix);

  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 H = normalize(L + V);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), uShininess) * 0.18;

  vec3 colour = albedo * (0.42 + 0.58 * diff) + vec3(spec);
  outColor = vec4(colour, 1.0);
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

const solidProg = createProgram(gl, TEXTURED_VS, TEXTURED_FS);
const lineProg = createProgram(gl, LINE_VS, LINE_FS);

const solidU = {
  model: gl.getUniformLocation(solidProg, 'uModel'),
  mvp: gl.getUniformLocation(solidProg, 'uMVP'),
  color: gl.getUniformLocation(solidProg, 'uColor'),
  texture: gl.getUniformLocation(solidProg, 'uTexture'),
  texMix: gl.getUniformLocation(solidProg, 'uTexMix'),
  lightDir: gl.getUniformLocation(solidProg, 'uLightDir'),
  cameraPos: gl.getUniformLocation(solidProg, 'uCameraPos'),
  shininess: gl.getUniformLocation(solidProg, 'uShininess'),
};
const lineU = {
  mvp: gl.getUniformLocation(lineProg, 'uMVP'),
  color: gl.getUniformLocation(lineProg, 'uColor'),
};

// Uniforms that do not change every frame.
gl.useProgram(solidProg);
gl.uniform3f(solidU.lightDir, 0.4, 0.9, 0.5);
gl.uniform1f(solidU.shininess, 32.0);
gl.uniform1i(solidU.texture, 0); // sampler unit 0

// ---------------------------------------------------------------- GL state
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LESS);
// All meshes are wound CCW as seen from outside (the OBJ loader flips the
// generated torus-knot winding), so back-face culling is safe and prevents
// accidentally seeing the inside of a closed mesh.
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);
gl.frontFace(gl.CCW);
gl.clearColor(0.07, 0.08, 0.12, 1);

// ---------------------------------------------------------------- meshes
const cubeMesh = createCubeMesh(gl, 1);
const planeMesh = createPlaneMesh(gl, 50);
const gridMesh = createGridMesh(gl, 50, 25);

const camera = new Camera({ position: new Vec3(0, 3, 9) });

// Module-level references used by the verification hook.
let knotVAO = null;
let textureMeta = { width: 0, height: 0, url: '', fallback: false };
let sceneObjectsList = [];
let planeMaterial = null;

// A small orbiting helper used by the animated objects.
function orbit(r, y, t, phase) {
  return new Vec3(Math.cos(t * 0.6 + phase) * r, y, Math.sin(t * 0.6 + phase) * r);
}

// Debug/verification hook (read-only for the app).
window.__M2__ = {
  ready: false,
  elapsed: 0,
  frameCount: 0,
  fps: 0,
  errors: [],
  diagnostics: () => diagnostics(),
  snapshot: () => snapshot(),
};

window.addEventListener('error', (e) => window.__M2__.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) =>
  window.__M2__.errors.push(String(e.reason && e.reason.message ? e.reason.message : e.reason)),
);

async function main() {
  let knotMesh = null;
  try {
    knotMesh = await loadObj(gl, 'assets/torus-knot.obj', { flipU: true, flipWinding: true });
    knotVAO = knotMesh.vao;
  } catch (err) {
    console.error(err);
    showError('Could not load assets/torus-knot.obj.\n' +
      'Run the project through a local HTTP server (see README.md), e.g.:\n' +
      '  node server.js   or   python -m http.server 8000');
  }

  // M2: upload the UV checker texture and keep a 1x1 white texture for the
  // untextured ground plane so every solid draw can share one program.
  let textureInfo;
  try {
    textureInfo = await loadTexture(gl, TEXTURE_URL, { anisotropy: 8 });
    console.info(`[M2] texture uploaded: ${textureInfo.width}x${textureInfo.height} ${textureInfo.url}`);
  } catch (err) {
    console.warn('[M2] texture load failed, using procedural fallback:', err);
    textureInfo = {
      texture: createFallbackTexture(gl),
      width: 64,
      height: 64,
      url: 'procedural-fallback',
      fallback: true,
    };
    showError('Texture failed to load; showing a procedural fallback.\n' + err.message);
  }
  textureMeta = {
    width: textureInfo.width,
    height: textureInfo.height,
    url: textureInfo.url,
    fallback: Boolean(textureInfo.fallback),
  };
  const whiteTexture = createWhiteTexture(gl);

  const knotMaterial = { texture: textureInfo.texture, texMix: 1.0 };
  const cubeMaterial = { texture: textureInfo.texture, texMix: 0.65 };
  planeMaterial = { texture: whiteTexture, texMix: 0.0 };

  const objects = [
    {
      name: 'knot',
      mesh: knotMesh,
      material: knotMaterial,
      color: [0.98, 0.97, 0.95],
      getState: (t) => ({
        pos: new Vec3(0, 2.4 + Math.sin(t * 0.9) * 0.12, 0),
        rotX: Math.sin(t * 0.5) * 0.22,
        rotY: t * 0.45,
        rotZ: 0,
        scale: 1,
      }),
    },
    {
      name: 'cube-red',
      mesh: cubeMesh,
      material: cubeMaterial,
      color: [0.95, 0.45, 0.40],
      getState: (t) => ({
        pos: orbit(4.2, 0.8 + Math.sin(t * 1.1) * 0.25, t, 0),
        rotX: t * 0.7,
        rotY: t * 1.0,
        rotZ: t * 0.35,
        scale: 0.7 + Math.sin(t * 1.4) * 0.05,
      }),
    },
    {
      name: 'cube-green',
      mesh: cubeMesh,
      material: cubeMaterial,
      color: [0.40, 0.90, 0.55],
      getState: (t) => ({
        pos: orbit(4.2, 0.8 + Math.sin(t * 1.1 + 2.1) * 0.25, t, Math.PI * 2 / 3),
        rotX: -t * 0.6,
        rotY: -t * 1.0,
        rotZ: t * 0.4,
        scale: 0.7 + Math.sin(t * 1.4 + 2.1) * 0.05,
      }),
    },
    {
      name: 'cube-blue',
      mesh: cubeMesh,
      material: cubeMaterial,
      color: [0.45, 0.60, 1.00],
      getState: (t) => ({
        pos: orbit(4.2, 0.8 + Math.sin(t * 1.1 + 4.2) * 0.25, t, Math.PI * 4 / 3),
        rotX: t * 0.8,
        rotY: t * 1.5,
        rotZ: -t * 0.3,
        scale: 0.7 + Math.sin(t * 1.4 + 4.2) * 0.05,
      }),
    },
  ];
  sceneObjectsList = objects;

  const uvFloats = knotMesh ? knotMesh.vertexCount * 2 : 0;
  infoBox.textContent =
    `WebGL2 / GLSL ES 3.00 · texture ${textureInfo.width}x${textureInfo.height} · ` +
    `UV floats @2: ${uvFloats} · depth test: ON`;

  setupInput();

  let last = performance.now();
  let hudTimer = 0;
  let fpsTime = 0;
  let fpsFrames = 0;

  function frame(now) {
    // Clamp dt so a background tab or a breakpoint cannot teleport the scene.
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    window.__M2__.elapsed += dt;
    const t = window.__M2__.elapsed;

    updateCamera(dt);
    render(objects, t);

    window.__M2__.frameCount++;
    fpsFrames++;
    fpsTime += dt;
    hudTimer += dt;

    if (fpsTime >= 0.5) {
      window.__M2__.fps = fpsFrames / fpsTime;
      fpsTime = 0;
      fpsFrames = 0;
    }
    if (hudTimer >= 0.75) {
      hudTimer = 0;
      infoBox.textContent =
        `WebGL2 / GLSL ES 3.00 · texture ${textureInfo.width}x${textureInfo.height} · ` +
        `UV floats @2: ${uvFloats} · depth: ON · ` +
        `t=${t.toFixed(1)}s · ${window.__M2__.fps.toFixed(0)} fps`;
    }

    if (!window.__M2__.ready && knotMesh && textureInfo.texture) {
      window.__M2__.ready = true;
      document.body.dataset.m2Ready = '1';
    }

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

  // The ground stays a flat M1-style material (white 1x1 texture + uTexMix=0).
  drawSolid(planeMesh, planeMaterial, [0.10, 0.12, 0.16], Mat4.identity(), pv);
  drawLine(gridMesh, [0.22, 0.26, 0.34], Mat4.identity(), pv);

  for (const obj of objects) {
    if (!obj.mesh) continue;
    const s = obj.getState(t);
    const rot = Mat4.multiply(
      Mat4.multiply(Mat4.rotationY(s.rotY), Mat4.rotationX(s.rotX)),
      Mat4.rotationZ(s.rotZ || 0),
    );
    const model = Mat4.multiply(
      Mat4.multiply(Mat4.translation(s.pos.x, s.pos.y, s.pos.z), rot),
      Mat4.scaling(s.scale, s.scale, s.scale),
    );
    obj.model = model;
    obj.lastState = s;
    drawSolid(obj.mesh, obj.material, obj.color, model, pv);
  }
}

function drawSolid(mesh, material, color, model, pv) {
  gl.useProgram(solidProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, material.texture);
  gl.uniform1i(solidU.texture, 0);
  gl.uniform1f(solidU.texMix, material.texMix);
  gl.uniformMatrix4fv(solidU.model, false, model.m);
  gl.uniformMatrix4fv(solidU.mvp, false, Mat4.multiply(pv, model).m);
  gl.uniform3fv(solidU.color, color);
  gl.uniform3f(solidU.cameraPos, camera.position.x, camera.position.y, camera.position.z);
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

// ---------------------------------------------------------------- verification helpers
function diagnostics() {
  const prevVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  if (knotVAO) gl.bindVertexArray(knotVAO);
  const uvEnabled = Boolean(gl.getVertexAttrib(2, gl.VERTEX_ATTRIB_ARRAY_ENABLED));
  const uvSize = gl.getVertexAttrib(2, gl.VERTEX_ATTRIB_ARRAY_SIZE);
  gl.bindVertexArray(prevVAO);

  // The last solid draw leaves the checker texture bound on unit 0.
  if (gl.getParameter(gl.ACTIVE_TEXTURE) !== gl.TEXTURE0) gl.activeTexture(gl.TEXTURE0);
  const tex = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const texWidth = textureMeta.width;
  const texHeight = textureMeta.height;

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

  return {
    webglVersion: gl.getParameter(gl.VERSION),
    glslVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'n/a',
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'n/a',
    programs: {
      texturedLinked: gl.getProgramParameter(solidProg, gl.LINK_STATUS),
      lineLinked: gl.getProgramParameter(lineProg, gl.LINK_STATUS),
    },
    cullFaceEnabled: gl.isEnabled(gl.CULL_FACE),
    texture: {
      bound: Boolean(tex) && gl.isTexture(tex),
      width: texWidth,
      height: texHeight,
      url: textureMeta.url,
      fallback: textureMeta.fallback,
    },
    uvAttribute: {
      location: 2,
      enabled: uvEnabled,
      size: uvSize,
      vertexCount: sceneObjectsList.find((o) => o.name === 'knot')?.mesh?.vertexCount ?? 0,
    },
    glError: gl.getError(),
    pageErrors: window.__M2__.errors.slice(),
  };
}

function snapshot() {
  const knot = sceneObjectsList.find((o) => o.name === 'knot');
  return {
    ready: window.__M2__.ready,
    elapsed: window.__M2__.elapsed,
    frameCount: window.__M2__.frameCount,
    fps: window.__M2__.fps,
    camera: {
      position: [camera.position.x, camera.position.y, camera.position.z],
      yaw: camera.yaw,
      pitch: camera.pitch,
      fov: camera.fov,
    },
    knotModel: knot && knot.model ? Array.from(knot.model.m) : null,
    knotState: knot && knot.lastState
      ? {
          pos: [knot.lastState.pos.x, knot.lastState.pos.y, knot.lastState.pos.z],
          rotY: knot.lastState.rotY,
          scale: knot.lastState.scale,
        }
      : null,
  };
}

// ---------------------------------------------------------------- helpers
function createFallbackTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#d05a5a' : '#202634';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

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
