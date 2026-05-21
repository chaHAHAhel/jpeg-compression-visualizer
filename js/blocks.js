/**
 * @module blocks
 * 8×8 block operations for JPEG compression.
 *
 * JPEG processes images in 8×8 pixel blocks. This module handles
 * extracting blocks from channel data, writing them back, and
 * computing block grid dimensions.
 */

/**
 * Extract an 8×8 block from channel data starting at the given block position.
 * If the block extends beyond the image boundary, edge values are replicated
 * (last row/column is repeated).
 *
 * @param {Float64Array} channelData - Row-major channel data
 * @param {number} channelWidth - Channel width in pixels
 * @param {number} channelHeight - Channel height in pixels
 * @param {number} blockX - Block column index (pixel start = blockX * 8)
 * @param {number} blockY - Block row index (pixel start = blockY * 8)
 * @returns {number[][]} 8×8 2D array (block[row][col])
 */
export function getBlock(channelData, channelWidth, channelHeight, blockX, blockY) {
  const startX = blockX * 8;
  const startY = blockY * 8;
  const block = [];

  for (let row = 0; row < 8; row++) {
    block[row] = [];
    const srcRow = Math.min(startY + row, channelHeight - 1);

    for (let col = 0; col < 8; col++) {
      const srcCol = Math.min(startX + col, channelWidth - 1);
      block[row][col] = channelData[srcRow * channelWidth + srcCol];
    }
  }

  return block;
}

/**
 * Write an 8×8 block back into channel data at the given block position.
 * Values are only written within the actual channel dimensions — pixels
 * beyond the boundary are silently skipped.
 *
 * @param {Float64Array} channelData - Row-major channel data (modified in-place)
 * @param {number} channelWidth - Channel width in pixels
 * @param {number} channelHeight - Channel height in pixels
 * @param {number} blockX - Block column index (pixel start = blockX * 8)
 * @param {number} blockY - Block row index (pixel start = blockY * 8)
 * @param {number[][]} block - 8×8 2D array to write
 * @returns {void}
 */
export function setBlock(channelData, channelWidth, channelHeight, blockX, blockY, block) {
  const startX = blockX * 8;
  const startY = blockY * 8;

  for (let row = 0; row < 8; row++) {
    const dstRow = startY + row;
    if (dstRow >= channelHeight) break;

    for (let col = 0; col < 8; col++) {
      const dstCol = startX + col;
      if (dstCol >= channelWidth) break;

      channelData[dstRow * channelWidth + dstCol] = block[row][col];
    }
  }
}

/**
 * Calculate the number of 8×8 blocks needed to cover the image.
 *
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {{blocksX: number, blocksY: number}} Block grid dimensions
 */
export function getBlockCount(width, height) {
  return {
    blocksX: Math.ceil(width / 8),
    blocksY: Math.ceil(height / 8),
  };
}
