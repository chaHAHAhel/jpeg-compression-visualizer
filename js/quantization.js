/**
 * @module quantization
 * JPEG quantization tables and operations.
 * Provides standard luminance and chrominance quantization matrices,
 * quality-based table scaling (libjpeg formula), and quantize/dequantize functions.
 */

/**
 * Standard JPEG luminance quantization table (8×8).
 * From ITU-T T.81, Annex K, Table K.1.
 * @type {number[][]}
 */
export const LUMINANCE_TABLE = [
  [16,  11,  10,  16,  24,  40,  51,  61],
  [12,  12,  14,  19,  26,  58,  60,  55],
  [14,  13,  16,  24,  40,  57,  69,  56],
  [14,  17,  22,  29,  51,  87,  80,  62],
  [18,  22,  37,  56,  68, 109, 103,  77],
  [24,  35,  55,  64,  81, 104, 113,  92],
  [49,  64,  78,  87, 103, 121, 120, 101],
  [72,  92,  95,  98, 112, 100, 103,  99]
];

/**
 * Standard JPEG chrominance quantization table (8×8).
 * From ITU-T T.81, Annex K, Table K.2.
 * @type {number[][]}
 */
export const CHROMINANCE_TABLE = [
  [17,  18,  24,  47,  99,  99,  99,  99],
  [18,  21,  26,  66,  99,  99,  99,  99],
  [24,  26,  56,  99,  99,  99,  99,  99],
  [47,  66,  99,  99,  99,  99,  99,  99],
  [99,  99,  99,  99,  99,  99,  99,  99],
  [99,  99,  99,  99,  99,  99,  99,  99],
  [99,  99,  99,  99,  99,  99,  99,  99],
  [99,  99,  99,  99,  99,  99,  99,  99]
];

/**
 * Scale a quantization table based on a JPEG quality factor.
 *
 * Uses the standard libjpeg scaling formula:
 *   - quality < 50 → scale = 5000 / quality
 *   - quality ≥ 50 → scale = 200 - 2 × quality
 *
 * Each table element is scaled and clamped to [1, 255].
 *
 * @param {number[][]} table   - Base 8×8 quantization table
 * @param {number}     quality - Quality factor (1–100). Higher = better quality / less compression.
 * @returns {number[][]} Scaled 8×8 quantization table
 */
export function scaleQuantTable(table, quality) {
  const scale = quality < 50
    ? 5000 / quality
    : 200 - 2 * quality;

  const scaled = Array.from({ length: 8 }, () => new Array(8));

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      scaled[i][j] = Math.max(
        1,
        Math.min(255, Math.floor((table[i][j] * scale + 50) / 100))
      );
    }
  }

  return scaled;
}

/**
 * Quantize an 8×8 block of DCT coefficients.
 *
 * Each coefficient is divided by the corresponding quantization table entry
 * and rounded to the nearest integer. This is the lossy step in JPEG compression.
 *
 * @param {number[][]} dctBlock   - 8×8 2D array of DCT coefficients
 * @param {number[][]} quantTable - 8×8 quantization table
 * @returns {number[][]} 8×8 2D array of quantized coefficients
 */
export function quantize(dctBlock, quantTable) {
  const result = Array.from({ length: 8 }, () => new Array(8));

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      result[i][j] = Math.round(dctBlock[i][j] / quantTable[i][j]);
    }
  }

  return result;
}

/**
 * Dequantize an 8×8 block of quantized coefficients.
 *
 * Each quantized coefficient is multiplied by the corresponding quantization
 * table entry to approximate the original DCT coefficients.
 *
 * @param {number[][]} quantBlock - 8×8 2D array of quantized coefficients
 * @param {number[][]} quantTable - 8×8 quantization table
 * @returns {number[][]} 8×8 2D array of dequantized DCT coefficients
 */
export function dequantize(quantBlock, quantTable) {
  const result = Array.from({ length: 8 }, () => new Array(8));

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      result[i][j] = quantBlock[i][j] * quantTable[i][j];
    }
  }

  return result;
}
