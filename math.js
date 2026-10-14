// math.js — Minimal Vec3 / Mat4 library written from scratch for COMP4422 M1.
// Matrices are stored column-major (the WebGL convention), which is the layout
// gl.uniformMatrix4fv expects.

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }

  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  mul(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  negate() { return new Vec3(-this.x, -this.y, -this.z); }

  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }

  cross(v) {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x,
    );
  }

  lengthSq() { return this.dot(this); }
  length() { return Math.sqrt(this.lengthSq()); }

  normalize() {
    const len = this.length();
    return len === 0 ? new Vec3(0, 0, 0) : this.mul(1 / len);
  }

  toString() {
    return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
  }

  static add(a, b) { return a.add(b); }
  static sub(a, b) { return a.sub(b); }
  static mul(a, s) { return a.mul(s); }
  static dot(a, b) { return a.dot(b); }
  static cross(a, b) { return a.cross(b); }
  static normalize(v) { return v.normalize(); }
}

export class Mat4 {
  constructor() {
    this.m = new Float32Array(16);
    this.m[0] = 1; this.m[5] = 1; this.m[10] = 1; this.m[15] = 1;
  }

  clone() { const o = new Mat4(); o.m.set(this.m); return o; }

  static identity() { return new Mat4(); }

  // out = a * b  (column-major multiplication)
  static multiply(a, b, out = new Mat4()) {
    const am = a.m, bm = b.m, om = out.m;
    for (let col = 0; col < 4; col++) {
      const b0 = bm[col * 4];
      const b1 = bm[col * 4 + 1];
      const b2 = bm[col * 4 + 2];
      const b3 = bm[col * 4 + 3];
      om[col * 4]     = am[0] * b0 + am[4] * b1 + am[8] * b2 + am[12] * b3;
      om[col * 4 + 1] = am[1] * b0 + am[5] * b1 + am[9] * b2 + am[13] * b3;
      om[col * 4 + 2] = am[2] * b0 + am[6] * b1 + am[10] * b2 + am[14] * b3;
      om[col * 4 + 3] = am[3] * b0 + am[7] * b1 + am[11] * b2 + am[15] * b3;
    }
    return out;
  }

  // Perspective projection. fovYRad is the vertical field of view in radians.
  static perspective(fovYRad, aspect, near, far, out = new Mat4()) {
    const f = 1 / Math.tan(fovYRad / 2);
    const nf = 1 / (near - far);
    const m = out.m;
    m[0] = f / aspect; m[1] = 0; m[2] = 0;   m[3] = 0;
    m[4] = 0;          m[5] = f; m[6] = 0;   m[7] = 0;
    m[8] = 0;          m[9] = 0; m[10] = (far + near) * nf; m[11] = -1;
    m[12] = 0;         m[13] = 0; m[14] = 2 * far * near * nf; m[15] = 0;
    return out;
  }

  // Right-handed lookAt view matrix.
  static lookAt(eye, center, up, out = new Mat4()) {
    let zx = eye.x - center.x, zy = eye.y - center.y, zz = eye.z - center.z;
    let len = Math.hypot(zx, zy, zz);
    if (len > 0) { zx /= len; zy /= len; zz /= len; }

    let xx = up.y * zz - up.z * zy;
    let xy = up.z * zx - up.x * zz;
    let xz = up.x * zy - up.y * zx;
    len = Math.hypot(xx, xy, xz);
    if (len > 0) { xx /= len; xy /= len; xz /= len; }

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    const m = out.m;
    m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
    m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
    m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
    m[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
    m[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
    m[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
    m[15] = 1;
    return out;
  }

  static translation(x, y, z, out = new Mat4()) {
    out.m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    return out;
  }

  static rotationX(rad, out = new Mat4()) {
    const c = Math.cos(rad), s = Math.sin(rad);
    out.m.set([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    return out;
  }

  static rotationY(rad, out = new Mat4()) {
    const c = Math.cos(rad), s = Math.sin(rad);
    out.m.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    return out;
  }

  static rotationZ(rad, out = new Mat4()) {
    const c = Math.cos(rad), s = Math.sin(rad);
    out.m.set([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return out;
  }

  static scaling(x, y, z, out = new Mat4()) {
    out.m.set([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
    return out;
  }

  static transpose(a, out = new Mat4()) {
    const am = a.m, om = out.m;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) om[r * 4 + c] = am[c * 4 + r];
    }
    return out;
  }

  static invert(a, out = new Mat4()) {
    const m = a.m, o = out.m;
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (det === 0) return null;
    det = 1 / det;

    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }
}
