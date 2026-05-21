/**
 * @module color-space
 * RGB ↔ YCbCr color space conversion using ITU-R BT.601 standard.
 */

/**
 * Convert a single RGB pixel to YCbCr color space.
 *
 * Uses ITU-R BT.601 conversion matrix:
 *   Y  =  0.299·R + 0.587·G + 0.114·B
 *   Cb = -0.168736·R - 0.331264·G + 0.5·B + 128
 *   Cr =  0.5·R - 0.418688·G - 0.081312·B + 128
 *
 * @param {number} r - Red channel value (0–255)
 * @param {number} g - Green channel value (0–255)
 * @param {number} b - Blue channel value (0–255)
 * @returns {{y: number, cb: number, cr: number}} YCbCr components
 */
export function rgbToYCbCr(r, g, b) {
  const y  =  0.299    * r + 0.587    * g + 0.114    * b;
  const cb = -0.168736 * r - 0.331264 * g + 0.5      * b + 128;
  const cr =  0.5      * r - 0.418688 * g - 0.081312 * b + 128;
  return { y, cb, cr };
}

/**
 * Convert a single YCbCr pixel back to RGB color space.
 *
 * Inverse of the ITU-R BT.601 transform:
 *   R = Y + 1.402·(Cr - 128)
 *   G = Y - 0.344136·(Cb - 128) - 0.714136·(Cr - 128)
 *   B = Y + 1.772·(Cb - 128)
 *
 * Results are rounded to the nearest integer and clamped to [0, 255].
 *
 * @param {number} y  - Luminance component
 * @param {number} cb - Blue-difference chroma component
 * @param {number} cr - Red-difference chroma component
 * @returns {{r: number, g: number, b: number}} RGB values clamped to 0–255
 */
export function yCbCrToRgb(y, cb, cr) {
  const r = y + 1.402   * (cr - 128);
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  const b = y + 1.772   * (cb - 128);

  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b)))
  };
}

/**
 * Convert an entire ImageData (RGBA) buffer to separate Y, Cb, Cr channel arrays.
 *
 * The alpha channel is ignored during conversion. Output arrays are stored in
 * row-major order where index = row * width + col.
 *
 * @param {ImageData} imageData - Source image data (RGBA pixel buffer)
 * @returns {{y: Float64Array, cb: Float64Array, cr: Float64Array, width: number, height: number}}
 *   Separate luma and chroma channel arrays along with image dimensions
 */
export function imageDataToYCbCr(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;

  const y  = new Float64Array(pixelCount);
  const cb = new Float64Array(pixelCount);
  const cr = new Float64Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    // Alpha (data[offset + 3]) is ignored

    const result = rgbToYCbCr(r, g, b);
    y[i]  = result.y;
    cb[i] = result.cb;
    cr[i] = result.cr;
  }

  return { y, cb, cr, width, height };
}

/**
 * Convert separate Y, Cb, Cr channel arrays back to an ImageData object.
 *
 * Each pixel's alpha channel is set to 255 (fully opaque). Channel arrays are
 * expected in row-major order where index = row * width + col.
 *
 * @param {Float64Array} y  - Luminance channel array
 * @param {Float64Array} cb - Blue-difference chroma channel array
 * @param {Float64Array} cr - Red-difference chroma channel array
 * @param {number} width    - Image width in pixels
 * @param {number} height   - Image height in pixels
 * @returns {ImageData} Reconstructed RGBA ImageData
 */
export function yCbCrToImageData(y, cb, cr, width, height) {
  const imageData = new ImageData(width, height);
  const { data } = imageData;
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const rgb = yCbCrToRgb(y[i], cb[i], cr[i]);
    const offset = i * 4;
    data[offset]     = rgb.r;
    data[offset + 1] = rgb.g;
    data[offset + 2] = rgb.b;
    data[offset + 3] = 255; // Fully opaque
  }

  return imageData;
}
