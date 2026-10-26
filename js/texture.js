// texture.js — WebGL2 texture creation, filtering, mipmap and sampler support.
//
// M2 addition: uploads an image to the GPU, configures wrap/filter state and
// generates mipmaps. A 1x1 white texture is provided so untextured geometry can
// share the same shader program without branching to a second program.

/**
 * Load an image URL and upload it as a repeating, mipmapped texture.
 * @param {WebGL2RenderingContext} gl
 * @param {string} url
 * @param {{ anisotropy?: number }} options
 * @returns {Promise<{texture: WebGLTexture, width: number, height: number, url: string}>}
 */
export async function loadTexture(gl, url, options = {}) {
  const image = await loadImage(url);
  const texture = createTextureFromImage(gl, image, options);
  return { texture, width: image.naturalWidth, height: image.naturalHeight, url };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The texture is same-origin, but this keeps the loader safe if a hosted
    // texture is used later (and gives a clear error instead of a tainted canvas).
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener(
      'error',
      () => reject(new Error(`Failed to load texture image: ${url}`)),
      { once: true },
    );
    image.src = url;
  });
}

/**
 * Upload an image (HTMLImageElement / ImageBitmap / canvas) to a WebGL texture.
 * @param {WebGL2RenderingContext} gl
 * @param {TexImageSource} source
 * @param {{ anisotropy?: number }} options
 */
export function createTextureFromImage(gl, source, options = {}) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('gl.createTexture() returned null');

  gl.bindTexture(gl.TEXTURE_2D, texture);

  // OBJ/GL UVs put v=0 at the bottom; image rows start at the top.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  // Repeat lets the same texture tile across large/UV-scaled geometry.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

  // 1024x1024 is power-of-two, so mipmaps are always valid.
  gl.generateMipmap(gl.TEXTURE_2D);

  // Optional anisotropic filtering improves the checker at grazing angles.
  const ext =
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  if (ext) {
    const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    const wanted = Math.min(options.anisotropy ?? 8, max);
    if (wanted > 1) {
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, wanted);
    }
  }

  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

/** A 1x1 opaque white texture, used for solid-colour materials. */
export function createWhiteTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}
