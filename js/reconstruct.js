/**
 * @module reconstruct
 * Full JPEG compression/decompression pipeline.
 *
 * Orchestrates the complete JPEG workflow: color space conversion,
 * chroma subsampling, 8×8 block DCT, quantization, dequantization,
 * inverse DCT, upsampling, and color space reconversion.
 */

import { imageDataToYCbCr, yCbCrToImageData } from './color-space.js';
import { subsample, upsample } from './subsampling.js';
import { getBlock, setBlock, getBlockCount } from './blocks.js';
import { dct2d, idct2d } from './dct.js';
import { LUMINANCE_TABLE, CHROMINANCE_TABLE, scaleQuantTable, quantize, dequantize } from './quantization.js';
import { zigzagScan, runLengthEncode } from './zigzag.js';

/**
 * Run the full JPEG compress → reconstruct pipeline and return the
 * reconstructed image along with compression statistics.
 *
 * @param {ImageData} imageData - Source image data (RGBA)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} quality - JPEG quality (1–100)
 * @param {string} subsamplingMode - Chroma subsampling: '4:4:4', '4:2:2', or '4:2:0'
 * @returns {{
 *   reconstructedImageData: ImageData,
 *   stats: {
 *     originalSize: number,
 *     estimatedCompressedSize: number,
 *     compressionRatio: number,
 *     psnr: number,
 *     zeroPercentage: number
 *   }
 * }}
 */
export function compressAndReconstruct(imageData, width, height, quality, subsamplingMode) {
  // Step 1: RGB → YCbCr
  const { y: Y, cb: Cb, cr: Cr } = imageDataToYCbCr(imageData);

  // Step 2: Subsample Cb and Cr
  const subCb = subsample(Cb, width, height, subsamplingMode);
  const subCr = subsample(Cr, width, height, subsamplingMode);

  // Scale quantization tables by quality
  const lumTable = scaleQuantTable(LUMINANCE_TABLE, quality);
  const chrTable = scaleQuantTable(CHROMINANCE_TABLE, quality);

  // Prepare channels for block processing
  const channels = [
    { data: new Float64Array(Y), w: width, h: height, table: lumTable },
    { data: new Float64Array(subCb.data), w: subCb.width, h: subCb.height, table: chrTable },
    { data: new Float64Array(subCr.data), w: subCr.width, h: subCr.height, table: chrTable },
  ];

  let totalCoefficients = 0;
  let zeroCount = 0;
  let nonZeroCount = 0;

  // Step 3: Process each channel block-by-block
  for (const ch of channels) {
    const { blocksX, blocksY } = getBlockCount(ch.w, ch.h);

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        // Extract block
        const block = getBlock(ch.data, ch.w, ch.h, bx, by);

        // Forward DCT
        const dctCoeffs = dct2d(block);

        // Quantize
        const quantized = quantize(dctCoeffs, ch.table);

        // Count zeros and non-zeros
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            totalCoefficients++;
            if (quantized[r][c] === 0) {
              zeroCount++;
            } else {
              nonZeroCount++;
            }
          }
        }

        // Dequantize
        const dequantized = dequantize(quantized, ch.table);

        // Inverse DCT
        const reconstructedBlock = idct2d(dequantized);

        // Write back
        setBlock(ch.data, ch.w, ch.h, bx, by, reconstructedBlock);
      }
    }
  }

  // Step 4: Upsample Cb, Cr back to original dimensions
  const reconY = channels[0].data;
  const reconCb = upsample(channels[1].data, channels[1].w, channels[1].h, width, height, subsamplingMode);
  const reconCr = upsample(channels[2].data, channels[2].w, channels[2].h, width, height, subsamplingMode);

  // Step 5: YCbCr → RGB
  const reconstructedImageData = yCbCrToImageData(reconY, reconCb, reconCr, width, height);

  // Step 6: Calculate statistics
  const originalSize = width * height * 3;
  const estimatedCompressedSize = nonZeroCount * 2; // Rough Huffman estimate
  const compressionRatio = originalSize / Math.max(1, estimatedCompressedSize);
  const psnr = calculatePSNR(imageData, reconstructedImageData, width, height);
  const zeroPercentage = totalCoefficients > 0
    ? (zeroCount / totalCoefficients) * 100
    : 0;

  return {
    reconstructedImageData,
    stats: {
      originalSize,
      estimatedCompressedSize,
      compressionRatio,
      psnr,
      zeroPercentage,
    },
  };
}

/**
 * Process a single 8×8 block through the full DCT → quantize → dequantize → IDCT
 * pipeline, returning all intermediate results for step-by-step visualization.
 *
 * @param {number[][]} block - 8×8 2D array of pixel values
 * @param {number[][]} quantTable - 8×8 quantization table
 * @returns {{
 *   dctCoeffs: number[][],
 *   quantized: number[][],
 *   dequantized: number[][],
 *   reconstructed: number[][]
 * }}
 */
export function processBlock(block, quantTable) {
  const dctCoeffs = dct2d(block);
  const quantized = quantize(dctCoeffs, quantTable);
  const dequantized = dequantize(quantized, quantTable);
  const reconstructed = idct2d(dequantized);

  return {
    dctCoeffs,
    quantized,
    dequantized,
    reconstructed,
  };
}

/**
 * Calculate Peak Signal-to-Noise Ratio between two images.
 *
 * @param {ImageData} original - Original image data
 * @param {ImageData} reconstructed - Reconstructed image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {number} PSNR in dB (Infinity if images are identical)
 */
export function calculatePSNR(original, reconstructed, width, height) {
  const origPixels = original.data;
  const reconPixels = reconstructed.data;
  const totalPixels = width * height;

  let sumSquaredError = 0;

  for (let i = 0; i < totalPixels; i++) {
    const pixIdx = i * 4;

    // Compare R, G, B channels (skip alpha)
    for (let c = 0; c < 3; c++) {
      const diff = origPixels[pixIdx + c] - reconPixels[pixIdx + c];
      sumSquaredError += diff * diff;
    }
  }

  const mse = sumSquaredError / (totalPixels * 3);

  if (mse === 0) {
    return Infinity;
  }

  return 10 * Math.log10((255 * 255) / mse);
}
