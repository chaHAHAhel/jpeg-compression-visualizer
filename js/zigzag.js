/**
 * @module zigzag
 * Zigzag scanning and run-length encoding for 8×8 JPEG blocks.
 * Provides the standard zigzag traversal order, scan/inverse-scan operations,
 * and run-length encoding of quantized AC coefficients.
 */

/**
 * Standard JPEG zigzag traversal order as flat indices (row × 8 + col).
 * Defines the order in which the 64 elements of an 8×8 block are read
 * when serializing DCT coefficients, going from low to high frequency.
 * @type {number[]}
 */
export const ZIGZAG_ORDER = [
   0,  1,  8, 16,  9,  2,  3, 10,
  17, 24, 32, 25, 18, 11,  4,  5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13,  6,  7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63
];

/**
 * Zigzag traversal order as (row, col) coordinate pairs.
 * Derived from {@link ZIGZAG_ORDER} for convenient 2D array access.
 * ZIGZAG_COORDS[i] gives the {row, col} of the i-th element in zigzag order.
 * @type {{row: number, col: number}[]}
 */
export const ZIGZAG_COORDS = ZIGZAG_ORDER.map(index => ({
  row: Math.floor(index / 8),
  col: index % 8
}));

/**
 * Read an 8×8 block in zigzag order into a flat array of 64 values.
 *
 * Traverses the 2D block following the standard JPEG zigzag pattern,
 * producing a 1D sequence ordered from lowest to highest spatial frequency.
 *
 * @param {number[][]} block - 8×8 2D array of values (typically quantized DCT coefficients)
 * @returns {number[]} Flat array of 64 values in zigzag order
 */
export function zigzagScan(block) {
  const result = new Array(64);

  for (let i = 0; i < 64; i++) {
    const { row, col } = ZIGZAG_COORDS[i];
    result[i] = block[row][col];
  }

  return result;
}

/**
 * Reconstruct an 8×8 block from a flat zigzag-ordered array.
 *
 * The inverse of {@link zigzagScan}. Places each element from the 1D array
 * back into its original 2D position according to the zigzag traversal order.
 *
 * @param {number[]} arr - Flat array of 64 values in zigzag order
 * @returns {number[][]} 8×8 2D array with values placed at their original positions
 */
export function inverseZigzag(arr) {
  const block = Array.from({ length: 8 }, () => new Array(8).fill(0));

  for (let i = 0; i < 64; i++) {
    const { row, col } = ZIGZAG_COORDS[i];
    block[row][col] = arr[i];
  }

  return block;
}

/**
 * Run-length encode a zigzag-scanned array of quantized DCT coefficients.
 *
 * Separates the DC coefficient (first element) from the AC coefficients.
 * AC coefficients are encoded as (zeros, value) pairs where `zeros` is the
 * count of consecutive zero-valued coefficients preceding a non-zero value.
 *
 * Special symbols:
 *   - **ZRL** (Zero Run Length): {zeros: 15, value: 0} — emitted when a run
 *     of consecutive zeros exceeds 15 (the maximum encodable run length).
 *   - **EOB** (End of Block): {zeros: 0, value: 0} — appended when the
 *     remaining coefficients are all zero.
 *
 * @param {number[]} zigzagArray - Flat array of 64 quantized coefficients in zigzag order
 * @returns {{dc: number, acPairs: Array<{zeros: number, value: number}>}}
 *   The DC coefficient and array of run-length encoded AC pairs
 */
export function runLengthEncode(zigzagArray) {
  const dc = zigzagArray[0];
  const acPairs = [];

  let zeroCount = 0;

  for (let i = 1; i < 64; i++) {
    if (zigzagArray[i] === 0) {
      zeroCount++;
    } else {
      // Emit ZRL symbols for runs longer than 15 zeros
      while (zeroCount > 15) {
        acPairs.push({ zeros: 15, value: 0 });
        zeroCount -= 16;
      }

      acPairs.push({ zeros: zeroCount, value: zigzagArray[i] });
      zeroCount = 0;
    }
  }

  // If there are trailing zeros, emit an EOB marker
  if (zeroCount > 0) {
    acPairs.push({ zeros: 0, value: 0 });
  }

  return { dc, acPairs };
}
