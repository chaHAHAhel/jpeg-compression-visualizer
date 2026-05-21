/**
 * Huffman Coding Core Logic for Images
 */

/**
 * Calculates the frequency of each grayscale pixel value (0-255).
 * @param {ImageData} imageData 
 * @returns {Array} Array of 256 integers representing frequencies.
 */
export function getHistogram(imageData) {
  const data = imageData.data;
  const frequencies = new Array(256).fill(0);
  
  // Convert to grayscale using standard luminance formula and count
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    frequencies[gray]++;
  }
  
  return frequencies;
}

/**
 * Node class for the Huffman Tree.
 */
class HuffmanNode {
  constructor(symbol, freq, left = null, right = null) {
    this.symbol = symbol; // 0-255, or null for internal nodes
    this.freq = freq;
    this.left = left;
    this.right = right;
  }
}

/**
 * Builds the Huffman tree and generates binary codes.
 * @param {Array} frequencies Array of 256 frequencies.
 * @returns {Object} { root, codes, sortedSymbols }
 */
export function buildHuffmanTree(frequencies) {
  // Create leaf nodes for non-zero frequencies
  let nodes = [];
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      nodes.push(new HuffmanNode(i, frequencies[i]));
    }
  }

  // Edge case: single color image
  if (nodes.length === 1) {
    const codes = new Array(256).fill(null);
    codes[nodes[0].symbol] = "0";
    return { root: nodes[0], codes, sortedSymbols: nodes };
  }

  // Sort initially for the priority queue
  nodes.sort((a, b) => a.freq - b.freq);

  // Keep a copy of the leaves sorted by frequency (descending) for the UI
  const sortedSymbols = [...nodes].sort((a, b) => b.freq - a.freq);

  // Build the tree
  while (nodes.length > 1) {
    // Take two lowest frequency nodes
    const left = nodes.shift();
    const right = nodes.shift();

    // Create a new internal node
    const parent = new HuffmanNode(null, left.freq + right.freq, left, right);

    // Insert back into the sorted array
    let inserted = false;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].freq > parent.freq) {
        nodes.splice(i, 0, parent);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      nodes.push(parent);
    }
  }

  const root = nodes[0];
  const codes = new Array(256).fill(null);

  // Traverse tree to generate codes
  function traverse(node, currentCode) {
    if (node.symbol !== null) {
      codes[node.symbol] = currentCode;
      return;
    }
    traverse(node.left, currentCode + "0");
    traverse(node.right, currentCode + "1");
  }

  traverse(root, "");

  return { root, codes, sortedSymbols };
}

/**
 * Calculates the total compressed size in bits.
 * @param {Array} frequencies 
 * @param {Array} codes 
 * @returns {Number} Total bits required for the image data
 */
export function calculateCompressedSize(frequencies, codes) {
  let totalBits = 0;
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0 && codes[i]) {
      totalBits += frequencies[i] * codes[i].length;
    }
  }
  return totalBits;
}
