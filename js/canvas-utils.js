/**
 * @module canvas-utils
 * Canvas rendering utilities for visualizing JPEG data.
 *
 * Provides functions for drawing image data, single-channel visualizations,
 * 8×8 block heatmaps, grid overlays, and color mapping utilities.
 */

/**
 * Draw ImageData directly to a canvas, resizing the canvas to match.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {ImageData} imageData - ImageData to render
 * @returns {void}
 */
export function drawImageDataToCanvas(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Render a single channel as a colored image on a canvas.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Float64Array} channelData - Row-major channel values
 * @param {number} width - Channel width in pixels
 * @param {number} height - Channel height in pixels
 * @param {string} colorMap - One of 'gray', 'red', 'green', 'blue', 'cb', 'cr'
 * @returns {void}
 */
export function drawChannelToCanvas(canvas, channelData, width, height, colorMap) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const value = Math.max(0, Math.min(255, Math.round(channelData[i])));
    const pixIdx = i * 4;

    switch (colorMap) {
      case 'gray':
        pixels[pixIdx] = value;
        pixels[pixIdx + 1] = value;
        pixels[pixIdx + 2] = value;
        break;

      case 'red':
        pixels[pixIdx] = value;
        pixels[pixIdx + 1] = 0;
        pixels[pixIdx + 2] = 0;
        break;

      case 'green':
        pixels[pixIdx] = 0;
        pixels[pixIdx + 1] = value;
        pixels[pixIdx + 2] = 0;
        break;

      case 'blue':
        pixels[pixIdx] = 0;
        pixels[pixIdx + 1] = 0;
        pixels[pixIdx + 2] = value;
        break;

      case 'cb': {
        // 0→blue(0,0,255), 128→gray(128,128,128), 255→yellow(255,255,0)
        const t = value / 255;
        if (t <= 0.5) {
          const s = t / 0.5; // 0..1 for first half
          pixels[pixIdx] = Math.round(0 + s * 128);
          pixels[pixIdx + 1] = Math.round(0 + s * 128);
          pixels[pixIdx + 2] = Math.round(255 + s * (128 - 255));
        } else {
          const s = (t - 0.5) / 0.5; // 0..1 for second half
          pixels[pixIdx] = Math.round(128 + s * (255 - 128));
          pixels[pixIdx + 1] = Math.round(128 + s * (255 - 128));
          pixels[pixIdx + 2] = Math.round(128 + s * (0 - 128));
        }
        break;
      }

      case 'cr': {
        // 0→cyan(0,255,255), 128→gray(128,128,128), 255→red(255,0,0)
        const t = value / 255;
        if (t <= 0.5) {
          const s = t / 0.5;
          pixels[pixIdx] = Math.round(0 + s * 128);
          pixels[pixIdx + 1] = Math.round(255 + s * (128 - 255));
          pixels[pixIdx + 2] = Math.round(255 + s * (128 - 255));
        } else {
          const s = (t - 0.5) / 0.5;
          pixels[pixIdx] = Math.round(128 + s * (255 - 128));
          pixels[pixIdx + 1] = Math.round(128 + s * (0 - 128));
          pixels[pixIdx + 2] = Math.round(128 + s * (0 - 128));
        }
        break;
      }

      default:
        // Fallback to grayscale
        pixels[pixIdx] = value;
        pixels[pixIdx + 1] = value;
        pixels[pixIdx + 2] = value;
        break;
    }

    pixels[pixIdx + 3] = 255; // Alpha
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draw an 8×8 2D array as a heatmap grid on a canvas.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {number[][]} block8x8 - 8×8 2D array of numeric values
 * @param {number} cellSize - Size of each cell in pixels
 * @param {Object} [options={}] - Rendering options
 * @param {boolean} [options.showValues=true] - Whether to display numeric values in cells
 * @param {string} [options.colorScale='diverging'] - Color scale: 'diverging' or 'sequential'
 * @param {number} [options.minValue] - Minimum value for color mapping (auto-detected if omitted)
 * @param {number} [options.maxValue] - Maximum value for color mapping (auto-detected if omitted)
 * @param {number} [options.fontSize=11] - Font size for cell values
 * @param {string} [options.fontFamily='JetBrains Mono, monospace'] - Font family for cell values
 * @returns {void}
 */
export function drawHeatmap(canvas, block8x8, cellSize, options = {}) {
  const {
    showValues = true,
    colorScale = 'diverging',
    fontSize = 11,
    fontFamily = 'JetBrains Mono, monospace',
  } = options;

  const canvasSize = 8 * cellSize;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');

  // Determine value range
  let minVal = options.minValue;
  let maxVal = options.maxValue;

  if (minVal === undefined || maxVal === undefined) {
    let autoMin = Infinity;
    let autoMax = -Infinity;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const v = block8x8[r][c];
        if (v < autoMin) autoMin = v;
        if (v > autoMax) autoMax = v;
      }
    }
    if (minVal === undefined) minVal = autoMin;
    if (maxVal === undefined) maxVal = autoMax;
  }

  // Draw cells
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const value = block8x8[r][c];
      let color;

      if (colorScale === 'diverging') {
        // Symmetric scale around zero
        const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal)) || 1;
        const t = (value / absMax + 1) / 2; // Map [-absMax, absMax] → [0, 1]
        const clampedT = Math.max(0, Math.min(1, t));
        color = divergingColor(clampedT);
      } else {
        // Sequential scale
        const range = maxVal - minVal || 1;
        const t = (value - minVal) / range;
        const clampedT = Math.max(0, Math.min(1, t));
        color = viridisColor(clampedT);
      }

      const x = c * cellSize;
      const y = r * cellSize;

      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillRect(x, y, cellSize, cellSize);

      // Draw value text
      if (showValues) {
        // Auto-choose text color based on background brightness
        const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
        ctx.fillStyle = brightness > 128 ? '#000000' : '#ffffff';
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          Math.round(value).toString(),
          x + cellSize / 2,
          y + cellSize / 2
        );
      }
    }
  }

  // Draw grid lines
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const pos = i * cellSize;

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvasSize);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(canvasSize, pos);
    ctx.stroke();
  }
}

/**
 * Draw a grid overlay on a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {number} width - Total width to cover
 * @param {number} height - Total height to cover
 * @param {number} cellSize - Size of each grid cell
 * @param {string} color - Grid line color (CSS color string)
 * @param {number} lineWidth - Grid line width in pixels
 * @returns {void}
 */
export function drawGrid(ctx, width, height, cellSize, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // Vertical lines
  for (let x = 0; x <= width; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

/**
 * Highlight a specific 8×8 block with a colored rectangle border.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {number} blockX - Block column index
 * @param {number} blockY - Block row index
 * @param {number} cellSize - Pixel size of one cell (block draws 8×cellSize)
 * @param {string} color - Border color (CSS color string)
 * @param {number} lineWidth - Border line width in pixels
 * @returns {void}
 */
export function drawBlockHighlight(ctx, blockX, blockY, cellSize, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(
    blockX * 8 * cellSize,
    blockY * 8 * cellSize,
    8 * cellSize,
    8 * cellSize
  );
}

/**
 * Approximate the viridis colormap.
 * Maps a normalized value t ∈ [0, 1] to an RGB color.
 *
 * @param {number} t - Normalized value between 0 and 1
 * @returns {{r: number, g: number, b: number}} RGB color (0–255)
 */
export function viridisColor(t) {
  const stops = [
    { t: 0.0, r: 68, g: 1, b: 84 },
    { t: 0.25, r: 59, g: 82, b: 139 },
    { t: 0.5, r: 33, g: 145, b: 140 },
    { t: 0.75, r: 94, g: 201, b: 98 },
    { t: 1.0, r: 253, g: 231, b: 37 },
  ];

  // Clamp
  const ct = Math.max(0, Math.min(1, t));

  // Find surrounding stops
  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (ct >= stops[i].t && ct <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.t - lower.t || 1;
  const s = (ct - lower.t) / range;

  return {
    r: Math.round(lower.r + s * (upper.r - lower.r)),
    g: Math.round(lower.g + s * (upper.g - lower.g)),
    b: Math.round(lower.b + s * (upper.b - lower.b)),
  };
}

/**
 * Diverging colormap: Blue → White → Red.
 * Maps a normalized value t ∈ [0, 1] where 0.5 is the midpoint (zero).
 *
 * @param {number} t - Normalized value: 0 = most negative, 0.5 = zero, 1 = most positive
 * @returns {{r: number, g: number, b: number}} RGB color (0–255)
 */
export function divergingColor(t) {
  const ct = Math.max(0, Math.min(1, t));

  // Blue (67, 147, 195) → White (255, 255, 255) → Red (214, 96, 77)
  if (ct <= 0.5) {
    const s = ct / 0.5; // 0 → 1
    return {
      r: Math.round(67 + s * (255 - 67)),
      g: Math.round(147 + s * (255 - 147)),
      b: Math.round(195 + s * (255 - 195)),
    };
  } else {
    const s = (ct - 0.5) / 0.5; // 0 → 1
    return {
      r: Math.round(255 + s * (214 - 255)),
      g: Math.round(255 + s * (96 - 255)),
      b: Math.round(255 + s * (77 - 255)),
    };
  }
}
