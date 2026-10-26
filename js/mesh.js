// mesh.js — Indexed triangle/line mesh backed by a WebGL2 VAO, drawn with drawElements.
//
// Attribute layout (matches the shaders in main.js):
//   location 0: vec3 position
//   location 1: vec3 normal
//   location 2: vec2 uv        (M2)

export class Mesh {
  constructor(gl, { positions, normals, uvs, indices, mode = gl.TRIANGLES }) {
    this.gl = gl;
    this.mode = mode;
    this.count = indices.length;
    this.vertexCount = positions.length / 3;
    this.buffers = [];
    this.hasUVs = Boolean(uvs && uvs.length > 0);

    // Pick the smallest index type that can address every vertex.
    let maxIndex = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] > maxIndex) maxIndex = indices[i];
    }
    if (maxIndex > 65535) {
      this.indexType = gl.UNSIGNED_INT;
      this.indexData = new Uint32Array(indices);
    } else {
      this.indexType = gl.UNSIGNED_SHORT;
      this.indexData = new Uint16Array(indices);
    }

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this._bindBuffer(new Float32Array(positions), 0, 3);
    if (normals && normals.length > 0) {
      this._bindBuffer(new Float32Array(normals), 1, 3);
    }
    if (this.hasUVs) {
      // UVs are uploaded once here and stay in the VAO for every draw call.
      this._bindBuffer(new Float32Array(uvs), 2, 2);
    }

    this.ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  _bindBuffer(data, location, size) {
    const gl = this.gl;
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    this.buffers.push(vbo);
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(this.mode, this.count, this.indexType, 0);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.ebo) gl.deleteBuffer(this.ebo);
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    this.buffers = [];
    this.vao = null;
    this.ebo = null;
  }
}
