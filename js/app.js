/**
 * @module app
 * Main application controller for the JPEG Compression Visualizer.
 * Manages step navigation, image loading, and rendering for each pipeline stage.
 */

import { imageDataToYCbCr, yCbCrToImageData } from './color-space.js';
import { subsample, upsample } from './subsampling.js';
import { getBlock, getBlockCount } from './blocks.js';
import { dct2d } from './dct.js';
import {
  LUMINANCE_TABLE, scaleQuantTable, quantize, dequantize
} from './quantization.js';
import { ZIGZAG_ORDER, ZIGZAG_COORDS, zigzagScan, runLengthEncode } from './zigzag.js';
import {
  drawImageDataToCanvas, drawChannelToCanvas, drawHeatmap,
  drawGrid, drawBlockHighlight
} from './canvas-utils.js';
import { loadImageFromFile, loadImageFromUrl, createSampleImage } from './image-loader.js';
import { compressAndReconstruct, processBlock } from './reconstruct.js';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentStep: 0,
  totalSteps: 8,
  imageLoaded: false,
  imageData: null,
  width: 0,
  height: 0,
  // YCbCr channels
  yChannel: null,
  cbChannel: null,
  crChannel: null,
  // Subsampling
  subsamplingMode: '4:4:4',
  // Block selection
  selectedBlockX: 0,
  selectedBlockY: 0,
  // Quality
  quality: 50,
  // Final settings
  finalQuality: 50,
  finalSubsampling: '4:2:0',
  finalZoom: 1.0,
};

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Initialize ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupStepNavigation();
  setupImageLoading();
  setupSubsamplingControls();
  setupBlockSelection();
  setupQualitySlider();
  setupZigzagAnimation();
  setupFinalControls();
  setupComparisonSlider();
  updateStepperUI();
});

// ─── Step Navigation ──────────────────────────────────────────────────────────
function setupStepNavigation() {
  $('btn-prev').addEventListener('click', () => navigateStep(-1));
  $('btn-next').addEventListener('click', () => navigateStep(1));

  // Click on stepper items
  $$('.step-item').forEach(item => {
    item.addEventListener('click', () => {
      const step = parseInt(item.dataset.step);
      if (step === 0 || state.imageLoaded) {
        goToStep(step);
      }
    });
  });
}

function navigateStep(delta) {
  const newStep = state.currentStep + delta;
  if (newStep >= 0 && newStep < state.totalSteps) {
    goToStep(newStep);
  }
}

function goToStep(step) {
  if (step > 0 && !state.imageLoaded) return;

  state.currentStep = step;
  updateStepperUI();
  updatePanelVisibility();
  renderCurrentStep();
}

function updateStepperUI() {
  const stepItems = $$('.step-item');
  const connectors = $$('.step-connector');

  stepItems.forEach((item, i) => {
    item.classList.remove('active', 'completed');
    if (i === state.currentStep) item.classList.add('active');
    else if (i < state.currentStep) item.classList.add('completed');
  });

  connectors.forEach((conn, i) => {
    conn.classList.remove('completed');
    if (i < state.currentStep) conn.classList.add('completed');
  });

  // Update footer
  $('step-indicator').textContent = `Step ${state.currentStep + 1} of ${state.totalSteps}`;
  $('btn-prev').disabled = state.currentStep === 0;

  const nextBtn = $('btn-next');
  if (state.currentStep === state.totalSteps - 1) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = '';
    if (state.currentStep === 0 && !state.imageLoaded) {
      nextBtn.disabled = true;
    } else {
      nextBtn.disabled = false;
    }
  }
}

function updatePanelVisibility() {
  $$('.step-panel').forEach((panel, i) => {
    panel.classList.remove('active');
    if (i === state.currentStep) {
      panel.classList.add('active');
    }
  });
}

function renderCurrentStep() {
  switch (state.currentStep) {
    case 0: renderStep0(); break;
    case 1: renderStep1(); break;
    case 2: renderStep2(); break;
    case 3: renderStep3(); break;
    case 4: renderStep4(); break;
    case 5: renderStep5(); break;
    case 6: renderStep6(); break;
    case 7: renderStep7(); break;
  }
}

// ─── Step 0: Original Image ──────────────────────────────────────────────────
function setupImageLoading() {
  const fileInput = $('file-input');
  const uploadArea = $('upload-area');

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const result = await loadImageFromFile(e.target.files[0], Infinity);
        loadImage(result);
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    }
  });

  // Drag & drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      try {
        const result = await loadImageFromFile(e.dataTransfer.files[0], Infinity);
        loadImage(result);
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    }
  });

  // Sample buttons
  $('btn-sample-gradient').addEventListener('click', () => {
    loadImage(createGradientSample());
  });
  $('btn-sample-shapes').addEventListener('click', () => {
    loadImage(createSampleImage(128, 128));
  });
  $('btn-sample-photo').addEventListener('click', () => {
    loadImage(createPhotoSample());
  });
  $('btn-sample-big-b').addEventListener('click', async () => {
    try {
      const result = await loadImageFromUrl('images/big_b.png', Infinity);
      loadImage(result);
    } catch (err) {
      console.error('Failed to load BIG B image:', err);
    }
  });
}

function createGradientSample() {
  const w = 128, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Rainbow-ish gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#ff6b6b');
  grad.addColorStop(0.25, '#feca57');
  grad.addColorStop(0.5, '#48dbfb');
  grad.addColorStop(0.75, '#ff9ff3');
  grad.addColorStop(1, '#54a0ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Add some structure
  const grad2 = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  grad2.addColorStop(0, 'rgba(255,255,255,0.6)');
  grad2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, w, h);

  return { imageData: ctx.getImageData(0, 0, w, h), width: w, height: h };
}

function createPhotoSample() {
  const w = 128, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#1a1a2e');
  sky.addColorStop(1, '#16213e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.6);

  // Ground
  const ground = ctx.createLinearGradient(0, h * 0.6, 0, h);
  ground.addColorStop(0, '#2d6a4f');
  ground.addColorStop(1, '#1b4332');
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  // Sun
  const sunGrad = ctx.createRadialGradient(100, 40, 0, 100, 40, 20);
  sunGrad.addColorStop(0, '#ffd166');
  sunGrad.addColorStop(0.5, '#f77f00');
  sunGrad.addColorStop(1, 'rgba(247,127,0,0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(100, 40, 20, 0, Math.PI * 2);
  ctx.fill();

  // Mountains
  ctx.fillStyle = '#0f3460';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.6);
  ctx.lineTo(30, h * 0.35);
  ctx.lineTo(60, h * 0.55);
  ctx.lineTo(90, h * 0.3);
  ctx.lineTo(128, h * 0.5);
  ctx.lineTo(128, h * 0.6);
  ctx.closePath();
  ctx.fill();

  // Trees (simple triangles)
  ctx.fillStyle = '#40916c';
  for (let tx of [20, 55, 85, 110]) {
    ctx.beginPath();
    ctx.moveTo(tx, h * 0.6);
    ctx.lineTo(tx - 8, h * 0.75);
    ctx.lineTo(tx + 8, h * 0.75);
    ctx.closePath();
    ctx.fill();
  }

  // Stars
  ctx.fillStyle = '#ffffff';
  const stars = [[15, 12], [45, 8], [70, 20], [25, 30], [110, 15], [88, 10]];
  for (const [sx, sy] of stars) {
    ctx.fillRect(sx, sy, 2, 2);
  }

  return { imageData: ctx.getImageData(0, 0, w, h), width: w, height: h };
}

function loadImage({ imageData, width, height }) {
  state.imageData = imageData;
  state.width = width;
  state.height = height;
  state.imageLoaded = true;

  // Pre-compute YCbCr channels
  const ycbcr = imageDataToYCbCr(imageData);
  state.yChannel = ycbcr.y;
  state.cbChannel = ycbcr.cb;
  state.crChannel = ycbcr.cr;

  // Default block selection
  state.selectedBlockX = 0;
  state.selectedBlockY = 0;

  renderStep0();
  updateStepperUI();
}

function renderStep0() {
  if (!state.imageLoaded) return;

  $('image-preview-card').style.display = 'block';
  drawImageDataToCanvas($('canvas-original'), state.imageData);

  const { width: w, height: h } = state;
  const { blocksX, blocksY } = getBlockCount(w, h);

  $('stat-dimensions').textContent = `${w} × ${h}`;
  $('stat-pixels').textContent = (w * h).toLocaleString();
  $('stat-raw-size').textContent = formatBytes(w * h * 3);
  $('stat-blocks').textContent = `${blocksX * blocksY}`;

  // Enable next button
  $('btn-next').disabled = false;
}

// ─── Step 1: Color Space Conversion ──────────────────────────────────────────
function renderStep1() {
  if (!state.imageLoaded) return;
  const { width: w, height: h, imageData } = state;

  // Extract RGB channels
  const rChannel = new Float64Array(w * h);
  const gChannel = new Float64Array(w * h);
  const bChannel = new Float64Array(w * h);

  for (let i = 0; i < w * h; i++) {
    rChannel[i] = imageData.data[i * 4];
    gChannel[i] = imageData.data[i * 4 + 1];
    bChannel[i] = imageData.data[i * 4 + 2];
  }

  drawChannelToCanvas($('canvas-red'), rChannel, w, h, 'red');
  drawChannelToCanvas($('canvas-green'), gChannel, w, h, 'green');
  drawChannelToCanvas($('canvas-blue'), bChannel, w, h, 'blue');
  drawChannelToCanvas($('canvas-y'), state.yChannel, w, h, 'gray');
  drawChannelToCanvas($('canvas-cb'), state.cbChannel, w, h, 'cb');
  drawChannelToCanvas($('canvas-cr'), state.crChannel, w, h, 'cr');
}

// ─── Step 2: Chroma Subsampling ──────────────────────────────────────────────
function setupSubsamplingControls() {
  const modeGroup = $('subsampling-mode');
  modeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.radio-option');
    if (!btn) return;
    modeGroup.querySelectorAll('.radio-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.subsamplingMode = btn.dataset.value;
    renderStep2();
  });
}

function renderStep2() {
  if (!state.imageLoaded) return;
  const { width: w, height: h } = state;
  const mode = state.subsamplingMode;

  // Subsample
  const subCb = subsample(state.cbChannel, w, h, mode);
  const subCr = subsample(state.crChannel, w, h, mode);

  // Draw channels
  drawChannelToCanvas($('canvas-sub-y'), state.yChannel, w, h, 'gray');
  drawChannelToCanvas($('canvas-sub-cb'), subCb.data, subCb.width, subCb.height, 'cb');
  drawChannelToCanvas($('canvas-sub-cr'), subCr.data, subCr.width, subCr.height, 'cr');

  // Reconstruct for comparison
  const upCb = upsample(subCb.data, subCb.width, subCb.height, w, h, mode);
  const upCr = upsample(subCr.data, subCr.width, subCr.height, w, h, mode);
  const reconImageData = yCbCrToImageData(state.yChannel, upCb, upCr, w, h);

  drawImageDataToCanvas($('canvas-sub-original'), state.imageData);
  drawImageDataToCanvas($('canvas-sub-reconstructed'), reconImageData);

  // Stats
  $('stat-sub-mode').textContent = mode;
  $('stat-sub-y-res').textContent = `${w}×${h}`;
  $('stat-sub-c-res').textContent = `${subCb.width}×${subCb.height}`;

  const savings = mode === '4:4:4' ? 0 : mode === '4:2:2' ? 33 : 50;
  $('stat-sub-savings').textContent = `${savings}%`;
}

// ─── Step 3: Block Splitting ─────────────────────────────────────────────────
function setupBlockSelection() {
  const canvas = $('canvas-blocks');
  canvas.addEventListener('click', (e) => {
    if (!state.imageLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = Math.floor((e.clientX - rect.left) * scaleX);
    const py = Math.floor((e.clientY - rect.top) * scaleY);

    state.selectedBlockX = Math.floor(px / 8);
    state.selectedBlockY = Math.floor(py / 8);

    const { blocksX, blocksY } = getBlockCount(state.width, state.height);
    state.selectedBlockX = Math.min(state.selectedBlockX, blocksX - 1);
    state.selectedBlockY = Math.min(state.selectedBlockY, blocksY - 1);

    renderStep3();
  });
}

function renderStep3() {
  if (!state.imageLoaded) return;
  const { width: w, height: h } = state;
  const canvas = $('canvas-blocks');

  // Draw Y channel
  drawChannelToCanvas(canvas, state.yChannel, w, h, 'gray');

  // Draw grid
  const ctx = canvas.getContext('2d');
  drawGrid(ctx, w, h, 8, 'rgba(99, 102, 241, 0.3)', 0.5);

  // Highlight selected block
  drawBlockHighlight(ctx, state.selectedBlockX, state.selectedBlockY, 1, '#6366f1', 2);

  // Get and display selected block
  const block = getBlock(state.yChannel, w, h, state.selectedBlockX, state.selectedBlockY);

  // Draw zoomed block
  drawHeatmap($('canvas-block-zoom'), block, 40, {
    showValues: true,
    colorScale: 'sequential',
    fontSize: 12,
  });

  const { blocksX, blocksY } = getBlockCount(w, h);
  $('block-info-text').textContent =
    `Block (${state.selectedBlockX}, ${state.selectedBlockY}) of ${blocksX}×${blocksY} grid — Position: (${state.selectedBlockX * 8}, ${state.selectedBlockY * 8})`;

  $('block-details').innerHTML =
    `<strong>Block position:</strong> Column ${state.selectedBlockX}, Row ${state.selectedBlockY}<br>` +
    `<strong>Pixel range:</strong> (${state.selectedBlockX * 8},${state.selectedBlockY * 8}) to (${Math.min(state.selectedBlockX * 8 + 7, w - 1)},${Math.min(state.selectedBlockY * 8 + 7, h - 1)})<br>` +
    `<strong>Values:</strong> Y channel luminance, 0 (black) to 255 (white)`;
}

// ─── Step 4: DCT Transform ──────────────────────────────────────────────────
function renderStep4() {
  if (!state.imageLoaded) return;
  const { width: w, height: h } = state;

  // Get the selected block
  const block = getBlock(state.yChannel, w, h, state.selectedBlockX, state.selectedBlockY);

  // Draw spatial domain
  drawHeatmap($('canvas-dct-spatial'), block, 40, {
    showValues: true,
    colorScale: 'sequential',
    fontSize: 12,
  });

  // Compute DCT
  const dctCoeffs = dct2d(block);

  // Draw frequency domain
  drawHeatmap($('canvas-dct-freq'), dctCoeffs, 40, {
    showValues: true,
    colorScale: 'diverging',
    fontSize: 10,
  });
}

// ─── Step 5: Quantization ────────────────────────────────────────────────────
function setupQualitySlider() {
  const slider = $('quality-slider');
  const valueLabel = $('quality-value');

  slider.addEventListener('input', () => {
    state.quality = parseInt(slider.value);
    valueLabel.textContent = state.quality;
    renderStep5();
  });
}

function renderStep5() {
  if (!state.imageLoaded) return;
  const { width: w, height: h } = state;

  // Get selected block and DCT
  const block = getBlock(state.yChannel, w, h, state.selectedBlockX, state.selectedBlockY);
  const dctCoeffs = dct2d(block);

  // Scale quantization table
  const quantTable = scaleQuantTable(LUMINANCE_TABLE, state.quality);

  // Quantize
  const quantized = quantize(dctCoeffs, quantTable);

  // Draw
  drawHeatmap($('canvas-quant-before'), dctCoeffs, 40, {
    showValues: true,
    colorScale: 'diverging',
    fontSize: 10,
  });

  drawHeatmap($('canvas-quant-table'), quantTable, 40, {
    showValues: true,
    colorScale: 'sequential',
    fontSize: 11,
  });

  drawHeatmap($('canvas-quant-after'), quantized, 40, {
    showValues: true,
    colorScale: 'diverging',
    fontSize: 11,
  });

  // Count zeros
  let zeros = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (quantized[r][c] === 0) zeros++;
    }
  }
  const nonzero = 64 - zeros;
  const zeroPct = ((zeros / 64) * 100).toFixed(1);

  $('stat-nonzero').textContent = nonzero;
  $('stat-zeros').textContent = zeros;
  $('stat-zero-pct').textContent = `${zeroPct}%`;
  $('zero-bar-fill').style.width = `${zeroPct}%`;
  $('zero-label').textContent = `${zeroPct}%`;
}

// ─── Step 6: Zigzag & Encoding ──────────────────────────────────────────────
function setupZigzagAnimation() {
  $('btn-zigzag-animate').addEventListener('click', () => {
    animateZigzag();
  });
}

function renderStep6() {
  if (!state.imageLoaded) return;
  const { width: w, height: h } = state;

  // Get block, DCT, quantize
  const block = getBlock(state.yChannel, w, h, state.selectedBlockX, state.selectedBlockY);
  const dctCoeffs = dct2d(block);
  const quantTable = scaleQuantTable(LUMINANCE_TABLE, state.quality);
  const quantized = quantize(dctCoeffs, quantTable);

  // Draw zigzag order on canvas
  drawZigzagOrder($('canvas-zigzag'), quantized);

  // Get zigzag sequence
  const zigzagArr = zigzagScan(quantized);

  // Render sequence
  renderZigzagSequence(zigzagArr);

  // Run-length encoding
  const rle = runLengthEncode(zigzagArr);
  renderRLE(rle);

  // Summary
  let nonZeroAC = 0;
  for (let i = 1; i < zigzagArr.length; i++) {
    if (zigzagArr[i] !== 0) nonZeroAC++;
  }
  $('encoding-summary').innerHTML =
    `<strong>DC coefficient:</strong> ${zigzagArr[0]}<br>` +
    `<strong>Non-zero AC coefficients:</strong> ${nonZeroAC} of 63<br>` +
    `<strong>RLE pairs:</strong> ${rle.acPairs.length} (including EOB)<br>` +
    `<strong>Data reduction:</strong> 64 values → ${1 + rle.acPairs.length * 2} symbols`;
}

function drawZigzagOrder(canvas, quantized) {
  const cellSize = 40;
  canvas.width = 8 * cellSize;
  canvas.height = 8 * cellSize;
  const ctx = canvas.getContext('2d');

  // Draw quantized values as background
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const val = quantized[r][c];
      if (val === 0) {
        ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
      } else {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
      }
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);

      // Value text
      ctx.fillStyle = val === 0 ? '#4a4a6a' : '#a5b4fc';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val.toString(), c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
    }
  }

  // Draw zigzag path
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let i = 0; i < ZIGZAG_COORDS.length; i++) {
    const { row, col } = ZIGZAG_COORDS[i];
    const x = col * cellSize + cellSize / 2;
    const y = row * cellSize + cellSize / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, 8 * cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellSize);
    ctx.lineTo(8 * cellSize, i * cellSize);
    ctx.stroke();
  }

  // Draw order numbers in corners
  ctx.font = '9px Inter, sans-serif';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < ZIGZAG_COORDS.length; i++) {
    const { row, col } = ZIGZAG_COORDS[i];
    ctx.fillText(i.toString(), col * cellSize + 2, row * cellSize + 2);
  }
}

function renderZigzagSequence(zigzagArr) {
  const container = $('zigzag-sequence');
  container.innerHTML = '';

  zigzagArr.forEach((val, i) => {
    const el = document.createElement('span');
    el.className = 'zigzag-value';
    el.textContent = val;
    el.dataset.index = i;

    if (i === 0) el.classList.add('dc');
    else if (val === 0) el.classList.add('zero');
    else el.classList.add('nonzero');

    container.appendChild(el);
  });
}

function renderRLE(rle) {
  const container = $('rle-display');
  container.innerHTML = '';

  // DC
  const dcEl = document.createElement('div');
  dcEl.className = 'rle-pair';
  dcEl.innerHTML = `<span class="rle-zeros" style="color: var(--warning);">DC</span><span class="rle-value" style="color: var(--warning);">${rle.dc}</span>`;
  container.appendChild(dcEl);

  // AC pairs
  rle.acPairs.forEach(pair => {
    const el = document.createElement('div');
    const isEOB = pair.zeros === 0 && pair.value === 0;
    el.className = 'rle-pair' + (isEOB ? ' eob' : '');

    if (isEOB) {
      el.innerHTML = `<span class="rle-zeros">EOB</span><span class="rle-value">End</span>`;
    } else {
      el.innerHTML = `<span class="rle-zeros">${pair.zeros} zeros</span><span class="rle-value">${pair.value}</span>`;
    }
    container.appendChild(el);
  });
}

function animateZigzag() {
  const sequenceEls = $('zigzag-sequence').querySelectorAll('.zigzag-value');
  if (sequenceEls.length === 0) return;

  // Remove all highlights
  sequenceEls.forEach(el => el.classList.remove('highlight'));

  let i = 0;
  const canvas = $('canvas-zigzag');
  const ctx = canvas.getContext('2d');
  const cellSize = 40;

  const interval = setInterval(() => {
    // Remove previous highlight
    if (i > 0) sequenceEls[i - 1].classList.remove('highlight');
    if (i >= 64) {
      clearInterval(interval);
      return;
    }

    // Highlight current
    sequenceEls[i].classList.add('highlight');

    // Draw marker on canvas
    const { row, col } = ZIGZAG_COORDS[i];
    ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
    ctx.beginPath();
    ctx.arc(col * cellSize + cellSize / 2, row * cellSize + cellSize / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // Scroll element into view
    sequenceEls[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    i++;
  }, 80);
}

// ─── Step 7: Final Result ────────────────────────────────────────────────────
function setupFinalControls() {
  const qualitySlider = $('final-quality-slider');
  const qualityValue = $('final-quality-value');

  let renderTimeout = null;
  qualitySlider.addEventListener('input', () => {
    state.finalQuality = parseInt(qualitySlider.value);
    qualityValue.textContent = state.finalQuality;
    
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      renderStep7();
    }, 100);
  });

  const zoomSlider = $('final-zoom-slider');
  const zoomValue = $('final-zoom-value');
  zoomSlider.addEventListener('input', () => {
    state.finalZoom = parseFloat(zoomSlider.value);
    zoomValue.textContent = state.finalZoom.toFixed(1) + 'x';
    updateComparisonDisplay();
  });

  // Subsampling mode
  const modeGroup = $('final-subsampling-mode');
  modeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.radio-option');
    if (!btn) return;
    modeGroup.querySelectorAll('.radio-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.finalSubsampling = btn.dataset.value;
    renderStep7();
  });

  // Download button
  $('btn-download').addEventListener('click', () => {
    if (!lastComparisonData) return;
    const { original, width, height } = lastComparisonData;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // We use the ORIGINAL image and let the browser's native JPEG encoder 
    // compress it at the selected quality, so the downloaded file is a true 
    // JPEG and its file size matches expectations!
    canvas.getContext('2d').putImageData(original, 0, 0);
    
    const qualityParam = Math.max(0.01, state.finalQuality / 100);
    
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compressed-q${state.finalQuality}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/jpeg', qualityParam);
  });
}

let comparisonDividerPos = 0.5; // 0..1

function setupComparisonSlider() {
  const container = $('comparison-container');
  let isDragging = false;

  const updateDivider = (clientX) => {
    const rect = container.getBoundingClientRect();
    comparisonDividerPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    updateComparisonDisplay();
  };

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateDivider(e.clientX);
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) updateDivider(e.clientX);
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch support
  container.addEventListener('touchstart', (e) => {
    isDragging = true;
    updateDivider(e.touches[0].clientX);
  });
  document.addEventListener('touchmove', (e) => {
    if (isDragging) updateDivider(e.touches[0].clientX);
  });
  document.addEventListener('touchend', () => {
    isDragging = false;
  });
}

let lastComparisonData = null;

function renderStep7() {
  if (!state.imageLoaded) return;
  const { imageData, width: w, height: h } = state;

  // Run full compression pipeline
  const result = compressAndReconstruct(
    imageData, w, h, state.finalQuality, state.finalSubsampling
  );

  lastComparisonData = {
    original: imageData,
    reconstructed: result.reconstructedImageData,
    width: w,
    height: h,
  };

  updateComparisonDisplay();

  // Stats
  const { stats } = result;
  $('stat-final-original').textContent = formatBytes(stats.originalSize);
  $('stat-final-compressed').textContent = formatBytes(stats.estimatedCompressedSize);
  $('stat-final-ratio').textContent = `${stats.compressionRatio.toFixed(1)}:1`;
  $('stat-final-psnr').textContent = stats.psnr === Infinity ? '∞' : `${stats.psnr.toFixed(1)}`;
  $('stat-final-zeros').textContent = `${stats.zeroPercentage.toFixed(1)}%`;
}

function updateComparisonDisplay() {
  if (!lastComparisonData) return;
  const { original, reconstructed, width: w, height: h } = lastComparisonData;

  const canvas = $('canvas-comparison');
  const container = $('comparison-container');
  const scale = Math.min(1, 560 / w); // Scale up for visibility
  const zoom = state.finalZoom || 1.0;
  
  // Internal canvas resolution remains constant relative to zoom
  const displayW = Math.round(w * Math.max(scale, 2));
  const displayH = Math.round(h * Math.max(scale, 2));

  canvas.width = displayW;
  canvas.height = displayH;
  
  // Update styles to support scrolling when zoomed, while fitting at 1x
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  
  container.style.width = `${displayW * zoom}px`;
  container.style.aspectRatio = `${displayW} / ${displayH}`;
  container.style.maxWidth = `${zoom * 100}%`; 
  container.style.maxHeight = `${zoom * 70}vh`; // Bound by the wrapper's 70vh limit
  container.style.margin = '0 auto';

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Draw original on left, reconstructed on right
  const splitX = Math.round(displayW * comparisonDividerPos);

  // Draw original (full, then clip)
  const origCanvas = document.createElement('canvas');
  origCanvas.width = w; origCanvas.height = h;
  origCanvas.getContext('2d').putImageData(original, 0, 0);

  const reconCanvas = document.createElement('canvas');
  reconCanvas.width = w; reconCanvas.height = h;
  reconCanvas.getContext('2d').putImageData(reconstructed, 0, 0);

  // Left side: original
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, displayH);
  ctx.clip();
  ctx.drawImage(origCanvas, 0, 0, displayW, displayH);
  ctx.restore();

  // Right side: reconstructed
  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, 0, displayW - splitX, displayH);
  ctx.clip();
  ctx.drawImage(reconCanvas, 0, 0, displayW, displayH);
  ctx.restore();

  // Update divider position
  $('comparison-divider').style.left = `${comparisonDividerPos * 100}%`;
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Magnifying Glass Effect ──────────────────────────────────────────────────
const syncGroups = [
  ['canvas-sub-original', 'canvas-sub-reconstructed']
];

document.addEventListener('mousemove', (e) => {
  const container = e.target.closest('.channel-item .canvas-container');
  if (container) {
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const canvas = container.querySelector('canvas');
    if (canvas) {
      canvas.style.transformOrigin = `${x}% ${y}%`;
      
      const group = syncGroups.find(g => g.includes(canvas.id));
      if (group) {
        group.forEach(id => {
          if (id !== canvas.id) {
            const sibling = document.getElementById(id);
            if (sibling) {
              sibling.style.transformOrigin = `${x}% ${y}%`;
              sibling.closest('.canvas-container').classList.add('force-hover');
            }
          }
        });
      }
    }
  }
});

document.addEventListener('mouseout', (e) => {
  const container = e.target.closest('.channel-item .canvas-container');
  if (container) {
    if (e.relatedTarget && container.contains(e.relatedTarget)) return;
    
    const canvas = container.querySelector('canvas');
    if (canvas) {
      const group = syncGroups.find(g => g.includes(canvas.id));
      if (group) {
        group.forEach(id => {
          const sibling = document.getElementById(id);
          if (sibling) {
            sibling.closest('.canvas-container').classList.remove('force-hover');
          }
        });
      }
    }
  }
});
