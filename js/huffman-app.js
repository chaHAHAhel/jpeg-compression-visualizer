import { loadImageFromFile, createSampleImage } from './image-loader.js';
import { getHistogram, buildHuffmanTree, calculateCompressedSize } from './huffman-core.js';

// ─── State Management ────────────────────────────────────────────────────────
const state = {
  currentStep: 0,
  totalSteps: 4,
  originalImageData: null,
  grayscaleImageData: null,
  width: 0,
  height: 0,
  frequencies: null,
  huffmanTree: null,
  huffmanCodes: null,
  sortedSymbols: null
};

// ─── UI Helpers ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function updateStepperUI() {
  // Update step indicators
  document.querySelectorAll('.step-item').forEach(item => {
    const step = parseInt(item.dataset.step, 10);
    item.classList.toggle('active', step <= state.currentStep);
  });

  // Update panels
  document.querySelectorAll('.step-panel').forEach((panel, index) => {
    panel.classList.toggle('active', index === state.currentStep);
  });

  // Update footer
  $('step-indicator').textContent = `Step ${state.currentStep + 1} of ${state.totalSteps}`;
  $('btn-prev').disabled = state.currentStep === 0;

  const nextBtn = $('btn-next');
  if (state.currentStep === state.totalSteps - 1) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = '';
    if (state.currentStep === 0 && !state.originalImageData) {
      nextBtn.disabled = true;
    } else {
      nextBtn.disabled = false;
    }
  }
}

function renderCurrentStep() {
  updateStepperUI();
  
  if (state.currentStep === 1) renderStep1();
  if (state.currentStep === 2) renderStep2();
  if (state.currentStep === 3) renderStep3();
}

// ─── DOM Events ──────────────────────────────────────────────────────────────
$('btn-prev').addEventListener('click', () => {
  if (state.currentStep > 0) {
    state.currentStep--;
    renderCurrentStep();
  }
});

$('btn-next').addEventListener('click', () => {
  if (state.currentStep < state.totalSteps - 1) {
    state.currentStep++;
    renderCurrentStep();
  }
});

document.querySelectorAll('.step-item').forEach(item => {
  item.addEventListener('click', () => {
    const step = parseInt(item.dataset.step, 10);
    // Only allow jumping to other steps if an image is loaded (except step 0)
    if (step === 0 || state.originalImageData) {
      state.currentStep = step;
      renderCurrentStep();
    }
  });
});

// File upload
const fileInput = $('file-input');
const uploadArea = $('upload-area');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--accent-color)'; });
uploadArea.addEventListener('dragleave', () => uploadArea.style.borderColor = '');
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
});

async function handleFile(file) {
  try {
    // No downscaling limit to preserve real image sizes if desired
    const { imageData, width, height } = await loadImageFromFile(file, Infinity);
    setImage(imageData, width, height);
  } catch (err) {
    alert('Error loading image: ' + err.message);
  }
}

// Samples
$('btn-sample-photo').addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Create gradient
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#10b981');
  grad.addColorStop(0.5, '#3b82f6');
  grad.addColorStop(1, '#8b5cf6');
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  
  // Add some circles
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(128, 128, 50, 0, Math.PI*2); ctx.fill();
  
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath(); ctx.arc(64, 64, 30, 0, Math.PI*2); ctx.fill();
  
  const imageData = ctx.getImageData(0, 0, 256, 256);
  setImage(imageData, 256, 256);
});

$('btn-sample-shapes').addEventListener('click', () => {
  const { imageData, width, height } = createSampleImage(256, 256);
  setImage(imageData, width, height);
});

$('btn-sample-binary').addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Fill with pure black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 256, 256);
  
  // Draw pure white rectangles (checkerboard pattern)
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      if ((x + y) % 64 === 0) {
        ctx.fillRect(x, y, 32, 32);
      }
    }
  }
  
  const imageData = ctx.getImageData(0, 0, 256, 256);
  setImage(imageData, 256, 256);
});

$('btn-download').addEventListener('click', () => {
  if (!state.grayscaleImageData) return;
  const canvas = document.createElement('canvas');
  canvas.width = state.width;
  canvas.height = state.height;
  canvas.getContext('2d').putImageData(state.grayscaleImageData, 0, 0);
  
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'huffman-reconstructed.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});


// ─── Image Processing ────────────────────────────────────────────────────────
function setImage(imageData, w, h) {
  state.originalImageData = imageData;
  state.width = w;
  state.height = h;

  // Convert to grayscale
  const canvasGray = document.createElement('canvas');
  canvasGray.width = w; canvasGray.height = h;
  const ctxGray = canvasGray.getContext('2d');
  const grayData = ctxGray.createImageData(w, h);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i+1];
    const b = imageData.data[i+2];
    const a = imageData.data[i+3];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    grayData.data[i] = gray;
    grayData.data[i+1] = gray;
    grayData.data[i+2] = gray;
    grayData.data[i+3] = a;
  }
  
  state.grayscaleImageData = grayData;

  // Draw on Step 0
  const cOrig = $('canvas-original');
  cOrig.width = w; cOrig.height = h;
  cOrig.getContext('2d').putImageData(imageData, 0, 0);

  const cGray = $('canvas-grayscale');
  cGray.width = w; cGray.height = h;
  cGray.getContext('2d').putImageData(grayData, 0, 0);

  $('image-preview-card').style.display = 'block';
  
  // Calculate Huffman components upfront
  state.frequencies = getHistogram(grayData);
  const huffData = buildHuffmanTree(state.frequencies);
  state.huffmanTree = huffData.root;
  state.huffmanCodes = huffData.codes;
  state.sortedSymbols = huffData.sortedSymbols;

  // Update UI to enable the Next button, but stay on Step 0
  updateStepperUI();
}

// ─── Render Steps ────────────────────────────────────────────────────────────
function renderStep1() {
  const freqs = state.frequencies;
  const totalPixels = state.width * state.height;
  let uniqueColors = 0;
  let mostFreqColor = 0;
  let maxFreq = 0;

  for (let i = 0; i < 256; i++) {
    if (freqs[i] > 0) {
      uniqueColors++;
      if (freqs[i] > maxFreq) {
        maxFreq = freqs[i];
        mostFreqColor = i;
      }
    }
  }

  $('stat-total-pixels').textContent = totalPixels.toLocaleString();
  $('stat-unique-colors').textContent = uniqueColors;
  $('stat-most-frequent').textContent = `Intensity ${mostFreqColor}`;

  const container = $('histogram-container');
  container.innerHTML = '';
  
  // Create bars
  for (let i = 0; i < 256; i++) {
    const bar = document.createElement('div');
    bar.className = 'hist-bar';
    const heightPct = maxFreq > 0 ? (freqs[i] / maxFreq) * 100 : 0;
    // ensure minimum 1px height so we don't have empty spots for 0 if we want, but 0 should be 0.
    bar.style.height = freqs[i] > 0 ? `max(1px, ${heightPct}%)` : '0';
    bar.title = `Color: ${i}\nCount: ${freqs[i]}`;
    container.appendChild(bar);
  }
}

function renderStep2() {
  const tbody = $('dictionary-body');
  tbody.innerHTML = '';

  const totalPixels = state.width * state.height;

  state.sortedSymbols.forEach(node => {
    if (node.freq === 0) return;
    
    const color = node.symbol;
    const freq = node.freq;
    const code = state.huffmanCodes[color];
    const stdBinary = color.toString(2).padStart(8, '0');
    
    const bitSavings = 8 - code.length;
    let savingsHtml = '';
    if (bitSavings > 0) {
      savingsHtml = `<span style="color: #4ade80;">Saved ${bitSavings} bits</span>`;
    } else if (bitSavings < 0) {
      savingsHtml = `<span style="color: #f87171;">Lost ${Math.abs(bitSavings)} bits</span>`;
    } else {
      savingsHtml = `<span style="color: #94a3b8;">No change</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="color-swatch" style="background: rgb(${color},${color},${color})"></span>
        ${color}
      </td>
      <td>${freq.toLocaleString()} (${((freq/totalPixels)*100).toFixed(1)}%)</td>
      <td style="color: var(--text-muted);">${stdBinary}</td>
      <td style="color: var(--accent-color); font-weight: bold;">${code}</td>
      <td>${savingsHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStep3() {
  const originalBits = state.width * state.height * 8; // 8 bits per pixel (grayscale)
  const compressedBits = calculateCompressedSize(state.frequencies, state.huffmanCodes);
  
  // Add dictionary overhead (approximate): 256 * (8 bit symbol + 8 bit code length) ~ 4096 bits. Let's just say 4096 bits overhead.
  const totalCompressedBits = compressedBits + 4096;

  const originalBytes = Math.ceil(originalBits / 8);
  const compressedBytes = Math.ceil(totalCompressedBits / 8);
  const ratio = originalBytes / compressedBytes;

  $('res-orig-size').textContent = formatBytes(originalBytes);
  $('res-comp-size').textContent = formatBytes(compressedBytes);
  $('res-ratio').textContent = `${ratio.toFixed(2)}x`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Initial render
updateStepperUI();
