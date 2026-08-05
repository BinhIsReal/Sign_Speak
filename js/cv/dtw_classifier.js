/**
 * DTWClassifier for Sign_Speak VSL Isolated & Continuous Gesture Recognition
 * Implements Full Temporal Trajectory DTW with Sakoe-Chiba Band constraints,
 * Uniform Motion Resampling (20 steps), Slot-swapped Hand Alignment,
 * Adaptive Complexity Thresholds, and Weighted Subspace Feature Distances.
 */

class DTWClassifier {
  constructor(options = {}) {
    this.defaultThreshold = options.maxDistanceThreshold || 0.18; // Default base distance threshold
    this.targetResampleFrames = options.targetResampleFrames || 20;  // Resample all motion sequences to 20 uniform time steps
    this.templates = []; // Array of { id, word, category, sequence: [ [157D], ... ] }
  }

  /**
   * Load training gesture templates into classifier memory
   * @param {Array} templates Array of gesture objects with sequence arrays
   */
  loadTemplates(templates) {
    if (Array.isArray(templates)) {
      this.templates = templates
        .filter(t => t && Array.isArray(t.sequence) && t.sequence.length > 0)
        .map(t => ({
          id: t.id,
          word: t.word,
          category: t.category || 'General',
          sequence: this.resampleSequence(t.sequence, this.targetResampleFrames)
        }));
    }
  }

  /**
   * Resample a variable-length motion sequence into N uniform temporal steps
   */
  resampleSequence(seq, targetLen) {
    if (!seq || seq.length === 0) return [];
    if (seq.length === targetLen) return seq;

    const sourceLen = seq.length;
    const resampled = [];
    const dim = seq[0].length;

    for (let i = 0; i < targetLen; i++) {
      const targetPos = (i / (targetLen - 1)) * (sourceLen - 1);
      const indexLow = Math.floor(targetPos);
      const indexHigh = Math.min(sourceLen - 1, Math.ceil(targetPos));
      const weightHigh = targetPos - indexLow;
      const weightLow = 1 - weightHigh;

      const interpolatedFrame = new Array(dim);
      const frameLow = seq[indexLow];
      const frameHigh = seq[indexHigh];

      for (let d = 0; d < dim; d++) {
        interpolatedFrame[d] = (frameLow[d] * weightLow) + (frameHigh[d] * weightHigh);
      }
      resampled.push(interpolatedFrame);
    }

    return resampled;
  }

  /**
   * Predict gesture label for an input sequence with Category-Adaptive Thresholding
   * @param {Array} inputSequence Array of feature frame vectors
   * @returns {Object} Prediction result { word, confidence, distance, isRejected }
   */
  predict(inputSequence) {
    if (!inputSequence || !Array.isArray(inputSequence) || inputSequence.length === 0) {
      return { word: null, confidence: 0, distance: Infinity, isRejected: true, reason: 'Empty sequence' };
    }

    if (this.templates.length === 0) {
      return { word: null, confidence: 0, distance: Infinity, isRejected: true, reason: 'No templates loaded' };
    }

    // Resample input sequence to uniform motion steps
    const resampledInput = this.resampleSequence(inputSequence, this.targetResampleFrames);

    // Detect if input sequence is a 2-hand gesture (check if spatial features are non-zero)
    const isTwoHandInput = resampledInput.some(f => f.length >= 145 && (f[136] !== 0 || f[137] !== 0 || f[138] !== 0));

    let minDistance = Infinity;
    let bestMatch = null;

    for (let template of this.templates) {
      const dist = this.computeDTWDistance(resampledInput, template.sequence);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = template;
      }
    }

    // Category-Adaptive Dynamic Distance Thresholds:
    // 2-Hand Dynamic Multi-Phase Gestures ("Vui vẻ", "Xin chào 2 tay") -> 0.24 (higher natural variance)
    // 1-Hand Dynamic Gestures ("Bạn", "Tôi") -> 0.18
    // 1-Hand Static Gestures -> 0.14
    let adaptiveThreshold = this.defaultThreshold;
    if (bestMatch) {
      const isTwoHandTemplate = bestMatch.sequence.some(f => f.length >= 145 && (f[136] !== 0 || f[137] !== 0 || f[138] !== 0));
      if (isTwoHandTemplate || isTwoHandInput) {
        adaptiveThreshold = 0.24;
      } else {
        adaptiveThreshold = 0.18;
      }
    }

    const isRejected = minDistance > adaptiveThreshold;
    // Calibrated formula: minDistance <= adaptiveThreshold maps linearly to 80% - 100% confidence
    const rawConf = isRejected ? Math.max(0, 100 - (minDistance / (adaptiveThreshold * 2.0)) * 40) : Math.max(0, 100 - (minDistance / adaptiveThreshold) * 20);
    const confidence = Math.round(rawConf);

    return {
      word: isRejected ? null : (bestMatch ? bestMatch.word : null),
      id: isRejected ? null : (bestMatch ? bestMatch.id : null),
      matchedTemplate: bestMatch ? bestMatch.word : null,
      distance: parseFloat(minDistance.toFixed(4)),
      confidence: confidence,
      isRejected: isRejected,
      thresholdUsed: adaptiveThreshold
    };
  }

  /**
   * Calculate DTW distance between sequence A and sequence B
   * with Sakoe-Chiba constraint band W = max(6, |N - M| + 4)
   */
  computeDTWDistance(seqA, seqB) {
    const N = seqA.length;
    const M = seqB.length;

    const W = Math.max(6, Math.abs(N - M) + 4);

    const costMatrix = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(Infinity));
    costMatrix[0][0] = 0;

    for (let i = 1; i <= N; i++) {
      const minJ = Math.max(1, i - W);
      const maxJ = Math.min(M, i + W);

      // Progressive Ending Trajectory Weighting
      const timeWeight = 0.6 + 0.8 * (i / N);

      for (let j = minJ; j <= maxJ; j++) {
        const frameDist = this.vectorDistance(seqA[i - 1], seqB[j - 1]) * timeWeight;
        const minPrev = Math.min(
          costMatrix[i - 1][j],     // Insertion
          costMatrix[i][j - 1],     // Deletion
          costMatrix[i - 1][j - 1]  // Match
        );
        costMatrix[i][j] = frameDist + minPrev;
      }
    }

    const pathLength = Math.max(N, M);
    const rawDTWScore = costMatrix[N][M];

    if (rawDTWScore === Infinity) {
      return 999.0;
    }

    return rawDTWScore / pathLength;
  }

  /**
   * Calculate distance between two feature vectors with weighted subspace disambiguation
   */
  vectorDistance(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 1.0;

    const hand1A = vecA.slice(0, 63);
    const hand2A = vecA.slice(63, 126);
    const fingerExtA = vecA.length >= 136 ? vecA.slice(126, 136) : new Array(10).fill(0);

    const hand1B = vecB.slice(0, 63);
    const hand2B = vecB.slice(63, 126);
    const fingerExtB = vecB.length >= 136 ? vecB.slice(126, 136) : new Array(10).fill(0);

    const distDirect = this.subVectorDist(hand1A, hand1B) + this.subVectorDist(hand2A, hand2B);
    const distSwapped = this.subVectorDist(hand1A, hand2B) + this.subVectorDist(hand2A, hand1B);

    const minHandDist = Math.min(distDirect, distSwapped);
    const fingerExtDist = this.subVectorDist(fingerExtA, fingerExtB);

    const spatialA = vecA.length >= 145 ? vecA.slice(136, 145) : [];
    const spatialB = vecB.length >= 145 ? vecB.slice(136, 145) : [];
    const spatialDist = this.subVectorDist(spatialA, spatialB);

    const hasSpatial = spatialA.some(v => v !== 0) || spatialB.some(v => v !== 0);

    // Dynamic Subspace Distance Weighting
    // For 2-hand spatial gestures: 50% Hand Shapes + 20% Finger Extensions + 30% Relative 3D Spatial Vector
    // For 1-hand gestures: 55% Hand Shapes + 30% Finger Extensions + 15% Spatial
    if (hasSpatial) {
      return (minHandDist * 0.50) + (fingerExtDist * 0.20) + (spatialDist * 0.30);
    } else {
      return (minHandDist * 0.55) + (fingerExtDist * 0.30) + (spatialDist * 0.15);
    }
  }

  subVectorDist(subA, subB) {
    let sumSq = 0;
    const len = Math.min(subA.length, subB.length);
    if (len === 0) return 0;
    for (let i = 0; i < len; i++) {
      const d = subA[i] - subB[i];
      sumSq += d * d;
    }
    return Math.sqrt(sumSq / len);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DTWClassifier;
} else {
  window.DTWClassifier = DTWClassifier;
}
