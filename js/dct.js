/**
 * @module dct
 * 2D Discrete Cosine Transform for 8×8 blocks with precomputed cosine table.
 * Used in JPEG compression to convert spatial-domain pixel values into
 * frequency-domain coefficients.
 */

const BLOCK_SIZE = 8;

/**
 * Precomputed cosine lookup table.
 * cosTable[freq * 8 + pos] = cos((2 * pos + 1) * freq * π / 16)
 * @type {Float64Array}
 */
const cosTable = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);

/**
 * Precomputed normalization factors.
 * alphaTable[0] = 1/√2, alphaTable[i] = 1 for i > 0
 * @type {Float64Array}
 */
const alphaTable = new Float64Array(BLOCK_SIZE);

// Initialize lookup tables on module load
(() => {
  for (let freq = 0; freq < BLOCK_SIZE; freq++) {
    for (let pos = 0; pos < BLOCK_SIZE; pos++) {
      cosTable[freq * BLOCK_SIZE + pos] =
        Math.cos(((2 * pos + 1) * freq * Math.PI) / 16);
    }
  }

  for (let i = 0; i < BLOCK_SIZE; i++) {
    alphaTable[i] = i === 0 ? 1 / Math.sqrt(2) : 1;
  }
})();

/**
 * Perform a 1D DCT on a row of 8 values.
 *
 * @param {number[]} input - Array of 8 level-shifted values
 * @returns {number[]} Array of 8 DCT coefficients
 */
function dct1d(input) {
  const output = new Array(BLOCK_SIZE);

  for (let freq = 0; freq < BLOCK_SIZE; freq++) {
    let sum = 0;
    for (let pos = 0; pos < BLOCK_SIZE; pos++) {
      sum += input[pos] * cosTable[freq * BLOCK_SIZE + pos];
    }
    // Include the 0.5 factor per dimension here
    output[freq] = 0.5 * alphaTable[freq] * sum;
  }

  return output;
}

/**
 * Perform a 1D inverse DCT on a row of 8 coefficients.
 *
 * @param {number[]} input - Array of 8 DCT coefficients
 * @returns {number[]} Array of 8 reconstructed values
 */
function idct1d(input) {
  const output = new Array(BLOCK_SIZE);

  for (let pos = 0; pos < BLOCK_SIZE; pos++) {
    let sum = 0;
    for (let freq = 0; freq < BLOCK_SIZE; freq++) {
      sum += alphaTable[freq] * input[freq] * cosTable[freq * BLOCK_SIZE + pos];
    }
    // Include the 0.5 factor per dimension here
    output[pos] = 0.5 * sum;
  }

  return output;
}

/**
 * Compute the 2D DCT of an 8×8 block.
 *
 * Internally level-shifts the input by subtracting 128 before performing the
 * transform. Uses a separable approach: applies 1D DCT to each row, then
 * applies 1D DCT to each column of the intermediate result.
 *
 * F(u,v) = (1/4) · C(u)·C(v) · Σ_x Σ_y (f(x,y) - 128) · cos(...) · cos(...)
 * where C(0) = 1/√2, C(k) = 1 for k > 0
 *
 * @param {number[][]} block - 8×8 2D array of pixel values (0–255)
 * @returns {number[][]} 8×8 2D array of DCT coefficients
 */
export function dct2d(block) {
  // Step 1: Apply 1D DCT to each row (with level shift)
  const intermediate = [];
  for (let row = 0; row < BLOCK_SIZE; row++) {
    const shifted = new Array(BLOCK_SIZE);
    for (let col = 0; col < BLOCK_SIZE; col++) {
      shifted[col] = block[row][col] - 128;
    }
    intermediate.push(dct1d(shifted));
  }

  // Step 2: Apply 1D DCT to each column of the intermediate result
  // Each 1D DCT already includes the 0.5 * alpha factor,
  // so two passes give us (1/4) * C(u) * C(v) * sum — the correct 2D DCT.
  const result = Array.from({ length: BLOCK_SIZE }, () => new Array(BLOCK_SIZE));
  for (let col = 0; col < BLOCK_SIZE; col++) {
    const column = new Array(BLOCK_SIZE);
    for (let row = 0; row < BLOCK_SIZE; row++) {
      column[row] = intermediate[row][col];
    }
    const transformed = dct1d(column);
    for (let row = 0; row < BLOCK_SIZE; row++) {
      result[row][col] = transformed[row];
    }
  }

  return result;
}

/**
 * Compute the 2D inverse DCT of an 8×8 block of coefficients.
 *
 * Reconstructs spatial-domain pixel values from frequency-domain coefficients.
 * Adds 128 back (inverse of level-shift) and clamps to [0, 255].
 *
 * f(x,y) = (1/4) · Σ_u Σ_v C(u)·C(v)·F(u,v) · cos(...) · cos(...) + 128
 *
 * @param {number[][]} coeffs - 8×8 2D array of DCT coefficients
 * @returns {number[][]} 8×8 2D array of reconstructed pixel values (0–255)
 */
export function idct2d(coeffs) {
  // Step 1: Apply 1D inverse DCT to each column
  // Each 1D IDCT includes the 0.5 factor, so two passes give (1/4) total.
  const intermediate = Array.from({ length: BLOCK_SIZE }, () => new Array(BLOCK_SIZE));
  for (let col = 0; col < BLOCK_SIZE; col++) {
    const column = new Array(BLOCK_SIZE);
    for (let row = 0; row < BLOCK_SIZE; row++) {
      column[row] = coeffs[row][col];
    }
    const reconstructed = idct1d(column);
    for (let row = 0; row < BLOCK_SIZE; row++) {
      intermediate[row][col] = reconstructed[row];
    }
  }

  // Step 2: Apply 1D inverse DCT to each row, add 128, and clamp
  const result = Array.from({ length: BLOCK_SIZE }, () => new Array(BLOCK_SIZE));
  for (let row = 0; row < BLOCK_SIZE; row++) {
    const reconstructed = idct1d(intermediate[row]);
    for (let col = 0; col < BLOCK_SIZE; col++) {
      const value = reconstructed[col] + 128;
      result[row][col] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }

  return result;
}
