// main.js — COMP4422 Group 12: Animated 3D Scene with WebGL2
// Implements M1 (geometry/camera), M2 (texturing/animation), and M3 (Blinn-Phong/scene graph/interaction).

import { Vec3, Mat4 } from './math.js';
import { Camera } from './camera.js';
import { createCubeMesh, createPlaneMesh, createGridMesh } from './primitives.js';
import { loadObj } from './obj-loader.js';
import { loadTexture, createWhiteTexture } from './texture.js';
import { SceneNode, drawScene } from './scenegraph.js';

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
const TEXTURED_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uMVP;
uniform mat3 uNormalMat;

out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;

void main() {
  vNormal = uNormalMat * aNormal;
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
uniform float uTexMix;
uniform vec3 uColor;

uniform vec3 uLightPos;
uniform vec3 uCameraPos;
uniform float uShininess;

uniform vec3 uAmbientColor;
uniform vec3 uDiffuseColor;
uniform vec3 uSpecularColor;
uniform bool uAmbientOn;
uniform bool uDiffuseOn;
uniform bool uSpecularOn;

out vec4 outColor;

void main() {
  vec4 texel = texture(uTexture, vUV);
  vec3 albedo = uColor * mix(vec3(1.0), texel.rgb, uTexMix);

  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 H = normalize(L + V);

  vec3 ambient = uAmbientOn ? uAmbientColor * albedo : vec3(0.0);
  float ndl = max(dot(N, L), 0.0);
  vec3 diffuse = uDiffuseOn ? uDiffuseColor * albedo * ndl : vec3(0.0);
  float spec = pow(max(dot(N, H), 0.0), uShininess);
  vec3 specular = uSpecularOn ? uSpecularColor * spec : vec3(0.0);

  outColor = vec4(ambient + diffuse + specular, 1.0);
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
  normalMat: gl.getUniformLocation(solidProg, 'uNormalMat'),
  color: gl.getUniformLocation(solidProg, 'uColor'),
  texture: gl.getUniformLocation(solidProg, 'uTexture'),
  texMix: gl.getUniformLocation(solidProg, 'uTexMix'),
  lightPos: gl.getUniformLocation(solidProg, 'uLightPos'),
  cameraPos: gl.getUniformLocation(solidProg, 'uCameraPos'),
  shininess: gl.getUniformLocation(solidProg, 'uShininess'),
  ambientColor: gl.getUniformLocation(solidProg, 'uAmbientColor'),
  diffuseColor: gl.getUniformLocation(solidProg, 'uDiffuseColor'),
  specularColor: gl.getUniformLocation(solidProg, 'uSpecularColor'),
  ambientOn: gl.getUniformLocation(solidProg, 'uAmbientOn'),
  diffuseOn: gl.getUniformLocation(solidProg, 'uDiffuseOn'),
  specularOn: gl.getUniformLocation(solidProg, 'uSpecularOn'),
};
const lineU = {
  mvp: gl.getUniformLocation(lineProg, 'uMVP'),
  color: gl.getUniformLocation(lineProg, 'uColor'),
};

// Static uniforms
gl.useProgram(solidProg);
gl.uniform1f(solidU.shininess, 128.0);
gl.uniform1i(solidU.texture, 0);
gl.uniform3f(solidU.ambientColor, 0.35, 0.35, 0.35);
gl.uniform3f(solidU.diffuseColor, 0.8, 0.8, 0.8);
gl.uniform3f(solidU.specularColor, 1.0, 1.0, 1.0);

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

const camera = new Camera({ position: new Vec3(0, 6, 12) });

let knotVAO = null;
let textureMeta = { width: 0, height: 0, url: '', fallback: false };
let sceneGraphRoot = null;

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

// ---------------------------------------------------------------- Main
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

// Scene Graph setup
  const root = new SceneNode('root');
  const ground = new SceneNode('ground', {
    mesh: planeMesh,
    texture: whiteTexture,
    color: [0.10, 0.12, 0.16],
    texMix: 0.0,
  });
  const knot = new SceneNode('knot', {
    mesh: knotMesh,
    texture: textureInfo.texture,
    color: [0.98, 0.97, 0.95],
    texMix: 1.0,
  });

  const orbitPivot = new SceneNode('orbitPivot');
  const parentCube = new SceneNode('parentCube', {
    mesh: cubeMesh,
    texture: textureInfo.texture,
    color: [0.95, 0.45, 0.40],
    texMix: 0.65,
  });
  const childCube = new SceneNode('childCube', {
    mesh: cubeMesh,
    texture: textureInfo.texture,
    color: [0.40, 0.90, 0.55],
    texMix: 0.65,
  });

  root.addChild(ground);
  root.addChild(knot);
  root.addChild(orbitPivot);
  orbitPivot.addChild(parentCube);
  parentCube.addChild(childCube);

  sceneGraphRoot = root;
  window.__M3__ = { root, knot, parentCube, childCube, orbitPivot };

// Interaction state
  const lightState = {
    ambient: true,
    diffuse: true,
    specular: true,
    orbit: true,
  };

  let lightAngle = 0;
  let isPaused = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Digit1') lightState.ambient = !lightState.ambient;
    if (e.code === 'Digit2') lightState.diffuse = !lightState.diffuse;
    if (e.code === 'Digit3') lightState.specular = !lightState.specular;
    if (e.code === 'KeyL') lightState.orbit = !lightState.orbit;
    if (e.code === 'KeyP') isPaused = !isPaused;
    if (e.code === 'KeyR') {
      lightAngle = 0;
      lightState.ambient = true;
      lightState.diffuse = true;
      lightState.specular = true;
      lightState.orbit = true;
      isPaused = false;
    }
});

  const uvFloats = knotMesh ? knotMesh.vertexCount * 2 : 0;
  infoBox.textContent =
    `WebGL2 / GLSL ES 3.00 · texture ${textureInfo.width}x${textureInfo.height} · ` +
    `UV floats @2: ${uvFloats} · depth: ON`;
    
  setupInput();

  let last = performance.now();
  let hudTimer = 0;
  let fpsTime = 0;
  let fpsFrames = 0;

    function frame(now) {
      const rawDt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
      last = now;
    
      const animDt = isPaused ? 0 : rawDt;
    
      window.__M2__.elapsed += animDt;
      const t = window.__M2__.elapsed;
      
      // Animate Scene Graph
      knot.localMatrix = Mat4.multiply(
        Mat4.translation(0, 4.0 + Math.sin(t * 0.9) * 0.12, 0),
        Mat4.multiply(
          Mat4.rotationY(t * 0.45),
          Mat4.rotationX(Math.sin(t * 0.5) * 0.22)
        )
      );

    orbitPivot.localMatrix = Mat4.rotationY(t * 0.6);

    parentCube.localMatrix = Mat4.multiply(
      Mat4.translation(4.2, 0.8, 0),
      Mat4.multiply(
        Mat4.rotationY(t * 1.0),
        Mat4.rotationX(t * 0.7)
      )
    );

    childCube.localMatrix = Mat4.multiply(
      Mat4.translation(1.5, 0.5, 0),
      Mat4.scaling(0.5, 0.5, 0.5)
    );

    root.updateWorld(Mat4.identity());

    // Lighting updates
    if (lightState.orbit && !isPaused) {
      lightAngle += animDt * 0.7; 
    }
    const lightPos = [5 * Math.cos(lightAngle), 5, 5 * Math.sin(lightAngle)];
    gl.useProgram(solidProg);
    gl.uniform3fv(solidU.lightPos, lightPos);
    gl.uniform3f(solidU.cameraPos, camera.position.x, camera.position.y, camera.position.z);
    gl.uniform1i(solidU.ambientOn, lightState.ambient ? 1 : 0);
    gl.uniform1i(solidU.diffuseOn, lightState.diffuse ? 1 : 0);
    gl.uniform1i(solidU.specularOn, lightState.specular ? 1 : 0);

    updateCamera(rawDt);
    render(t);

    // HUD
    window.__M2__.frameCount++;
    fpsFrames++;
    fpsTime += rawDt;
    hudTimer += rawDt;

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
function render(t) {
  gl.viewport(0, 0, canvas.width, canvas.height);

  const aspect = canvas.width / canvas.height;
  const proj = camera.projectionMatrix(aspect);
  const view = camera.viewMatrix();
  const pv = Mat4.multiply(proj, view);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  drawLine(gridMesh, [0.22, 0.26, 0.34], Mat4.identity(), pv);

  if (!sceneGraphRoot) return;
  drawScene(sceneGraphRoot, (node) => {
    drawSolid(node.mesh, node, pv);
  });
}

function drawSolid(mesh, node, pv) {
  gl.useProgram(solidProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, node.texture);
  gl.uniform1i(solidU.texture, 0);
  gl.uniform1f(solidU.texMix, node.texMix);
  gl.uniform3fv(solidU.color, node.color);

  gl.uniformMatrix4fv(solidU.model, false, node.worldMatrix.m);
  gl.uniformMatrix4fv(solidU.mvp, false, Mat4.multiply(pv, node.worldMatrix).m);

  const inv = Mat4.invert(node.worldMatrix);
  if (inv) {
    const normalMat4 = Mat4.transpose(inv);
    const n3 = new Float32Array([
      normalMat4.m[0], normalMat4.m[1], normalMat4.m[2],
      normalMat4.m[4], normalMat4.m[5], normalMat4.m[6],
      normalMat4.m[8], normalMat4.m[9], normalMat4.m[10],
    ]);
    gl.uniformMatrix3fv(solidU.normalMat, false, n3);
  }

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
      vertexCount: findNodeByName(sceneGraphRoot, 'knot')?.mesh?.vertexCount ?? 0,
    },
    glError: gl.getError(),
    pageErrors: window.__M2__.errors.slice(),
  };
}

function findNodeByName(node, name) {
  if (!node) return null;
  if (node.name === name) return node;
  for (const child of node.children) {
    const found = findNodeByName(child, name);
    if (found) return found;
  }
  return null;
}

function snapshot() {
  const knot = findNodeByName(sceneGraphRoot, 'knot');
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
    knot: knot
      ? {
          worldMatrix: Array.from(knot.worldMatrix.m),
          localMatrix: Array.from(knot.localMatrix.m),
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
