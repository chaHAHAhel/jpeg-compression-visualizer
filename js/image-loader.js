/**
 * @module image-loader
 * Image loading utilities for the JPEG compression visualizer.
 *
 * Provides functions to load images from files or URLs with automatic
 * downscaling, and to create procedural test images for demonstration.
 */

/**
 * Load an image from a File object, scaling down if necessary.
 *
 * @param {File} file - File object (e.g. from an <input type="file">)
 * @param {number} [maxDim=256] - Maximum dimension (width or height). Image is
 *   scaled down proportionally if either dimension exceeds this value.
 * @returns {Promise<{imageData: ImageData, width: number, height: number}>}
 */
export function loadImageFromFile(file, maxDim = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const result = _scaleAndExtract(img, maxDim);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to decode image file'));
      img.src = /** @type {string} */ (reader.result);
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Load an image from a URL, scaling down if necessary.
 *
 * @param {string} url - Image URL (same-origin or CORS-enabled)
 * @param {number} [maxDim=256] - Maximum dimension for scaling
 * @returns {Promise<{imageData: ImageData, width: number, height: number}>}
 */
export function loadImageFromUrl(url, maxDim = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const result = _scaleAndExtract(img, maxDim);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error(`Failed to load image from URL: ${url}`));
    img.src = url;
  });
}

/**
 * Create a procedural sample image with sharp edges, gradients, and varied colors.
 * Useful for demonstrating JPEG compression artifacts.
 *
 * @param {number} [width=128] - Image width
 * @param {number} [height=128] - Image height
 * @returns {{imageData: ImageData, width: number, height: number}}
 */
export function createSampleImage(width = 128, height = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background: warm gradient (top-left orange to bottom-right purple)
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#FF6B35');
  gradient.addColorStop(1, '#7B2FBE');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Blue circle at center
  const centerX = width / 2;
  const centerY = height / 2;
  ctx.fillStyle = '#2563EB';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 25, 0, Math.PI * 2);
  ctx.fill();

  // Green rectangle at top-right area
  ctx.fillStyle = '#16A34A';
  ctx.fillRect(width - 50, 15, 30, 20);

  // Red triangle at bottom-left area
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.moveTo(15, height - 15);
  ctx.lineTo(45, height - 15);
  ctx.lineTo(30, height - 45);
  ctx.closePath();
  ctx.fill();

  // White diagonal stripe (5px wide) from top-right toward center
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(width - 10, 10);
  ctx.lineTo(centerX, centerY);
  ctx.stroke();

  // Small yellow square at (80, 20)
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(80, 20, 15, 15);

  const imageData = ctx.getImageData(0, 0, width, height);
  return { imageData, width, height };
}

/**
 * Scale an image to fit within maxDim and extract its ImageData.
 *
 * @param {HTMLImageElement} img - Loaded image element
 * @param {number} maxDim - Maximum allowed dimension
 * @returns {{imageData: ImageData, width: number, height: number}}
 * @private
 */
function _scaleAndExtract(img, maxDim) {
  let { naturalWidth: w, naturalHeight: h } = img;

  // Scale down if needed, preserving aspect ratio
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = _createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  return { imageData, width: w, height: h };
}

/**
 * Create a canvas element (OffscreenCanvas if available, otherwise HTMLCanvasElement).
 *
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 * @private
 */
function _createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
