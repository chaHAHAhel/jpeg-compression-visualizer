/**
 * @module subsampling
 * Chroma subsampling for JPEG compression.
 *
 * Supports three standard chroma subsampling modes:
 * - 4:4:4 (no subsampling)
 * - 4:2:2 (horizontal 2:1 subsampling)
 * - 4:2:0 (horizontal and vertical 2:1 subsampling)
 */

/**
 * Subsample a single channel according to the specified mode.
 *
 * @param {Float64Array} channel - Row-major channel data (index = row * width + col)
 * @param {number} width - Original width in pixels
 * @param {number} height - Original height in pixels
 * @param {string} mode - Subsampling mode: '4:4:4', '4:2:2', or '4:2:0'
 * @returns {{data: Float64Array, width: number, height: number}} Subsampled channel
 */
export function subsample(channel, width, height, mode) {
  if (mode === '4:4:4') {
    return {
      data: new Float64Array(channel),
      width,
      height,
    };
  }

  if (mode === '4:2:2') {
    const newWidth = Math.ceil(width / 2);
    const newHeight = height;
    const data = new Float64Array(newWidth * newHeight);

    for (let row = 0; row < newHeight; row++) {
      for (let col = 0; col < newWidth; col++) {
        const srcCol = col * 2;
        const srcCol2 = Math.min(srcCol + 1, width - 1);
        const val1 = channel[row * width + srcCol];
        const val2 = channel[row * width + srcCol2];
        data[row * newWidth + col] = (val1 + val2) / 2;
      }
    }

    return { data, width: newWidth, height: newHeight };
  }

  if (mode === '4:2:0') {
    const newWidth = Math.ceil(width / 2);
    const newHeight = Math.ceil(height / 2);
    const data = new Float64Array(newWidth * newHeight);

    for (let row = 0; row < newHeight; row++) {
      for (let col = 0; col < newWidth; col++) {
        const srcRow = row * 2;
        const srcCol = col * 2;
        const srcRow2 = Math.min(srcRow + 1, height - 1);
        const srcCol2 = Math.min(srcCol + 1, width - 1);

        const val00 = channel[srcRow * width + srcCol];
        const val01 = channel[srcRow * width + srcCol2];
        const val10 = channel[srcRow2 * width + srcCol];
        const val11 = channel[srcRow2 * width + srcCol2];

        data[row * newWidth + col] = (val00 + val01 + val10 + val11) / 4;
      }
    }

    return { data, width: newWidth, height: newHeight };
  }

  throw new Error(`Unknown subsampling mode: ${mode}`);
}

/**
 * Upsample a subsampled channel back to original dimensions using nearest-neighbor.
 *
 * @param {Float64Array} channel - Subsampled channel data (row-major)
 * @param {number} subWidth - Width of the subsampled channel
 * @param {number} subHeight - Height of the subsampled channel
 * @param {number} origWidth - Target original width
 * @param {number} origHeight - Target original height
 * @param {string} mode - Subsampling mode: '4:4:4', '4:2:2', or '4:2:0'
 * @returns {Float64Array} Upsampled channel data at original dimensions
 */
export function upsample(channel, subWidth, subHeight, origWidth, origHeight, mode) {
  if (mode === '4:4:4') {
    return new Float64Array(channel);
  }

  const data = new Float64Array(origWidth * origHeight);

  if (mode === '4:2:2') {
    // Duplicate each value horizontally
    for (let row = 0; row < origHeight; row++) {
      for (let col = 0; col < origWidth; col++) {
        const srcCol = Math.min(Math.floor(col / 2), subWidth - 1);
        data[row * origWidth + col] = channel[row * subWidth + srcCol];
      }
    }
    return data;
  }

  if (mode === '4:2:0') {
    // Duplicate each value in 2×2 blocks
    for (let row = 0; row < origHeight; row++) {
      for (let col = 0; col < origWidth; col++) {
        const srcRow = Math.min(Math.floor(row / 2), subHeight - 1);
        const srcCol = Math.min(Math.floor(col / 2), subWidth - 1);
        data[row * origWidth + col] = channel[srcRow * subWidth + srcCol];
      }
    }
    return data;
  }

  throw new Error(`Unknown subsampling mode: ${mode}`);
}
