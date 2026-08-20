class DTWClassifier {
  constructor(options = {}) {
    this.defaultThreshold = options.maxDistanceThreshold || 0.18;
    this.targetResampleFrames = options.targetResampleFrames || 20;
    this.templates = [];
  }

  /**
   * Load training gesture templates into classifier memory
   * @param {Array} templates Array of gesture objects with sequence arrays
   */
  loadTemplates(templates) {
    if (Array.isArray(templates)) {
      this.templates = templates
        .filter((t) => t && Array.isArray(t.sequence) && t.sequence.length > 0)
        .map((t) => ({
          id: t.id,
          word: t.word,
          category: t.category || "General",
          sequence: this.resampleSequence(
            t.sequence,
            this.targetResampleFrames,
          ),
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
        interpolatedFrame[d] =
          frameLow[d] * weightLow + frameHigh[d] * weightHigh;
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
    if (
      !inputSequence ||
      !Array.isArray(inputSequence) ||
      inputSequence.length === 0
    ) {
      return {
        word: null,
        confidence: 0,
        distance: Infinity,
        isRejected: true,
        reason: "Empty sequence",
      };
    }

    if (this.templates.length === 0) {
      return {
        word: null,
        confidence: 0,
        distance: Infinity,
        isRejected: true,
        reason: "No templates loaded",
      };
    }

    // Resample input sequence to uniform motion steps
    const resampledInput = this.resampleSequence(
      inputSequence,
      this.targetResampleFrames,
    );

    // Detect if input sequence is a 2-hand gesture (check if spatial features are non-zero)
    const isTwoHandInput = resampledInput.some(
      (f) => f.length >= 145 && (f[136] !== 0 || f[137] !== 0 || f[138] !== 0),
    );

    let minDistance = Infinity;
    let bestMatch = null;

    for (let template of this.templates) {
      const dist = this.computeDTWDistance(resampledInput, template.sequence);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = template;
      }
    }

    let adaptiveThreshold = this.defaultThreshold;
    if (bestMatch) {
      const isTwoHandTemplate = bestMatch.sequence.some(
        (f) =>
          f.length >= 145 && (f[136] !== 0 || f[137] !== 0 || f[138] !== 0),
      );
      if (isTwoHandTemplate || isTwoHandInput) {
        adaptiveThreshold = 0.27;
      } else {
        adaptiveThreshold = 0.18;
      }
    }

    const isRejected = minDistance > adaptiveThreshold;
    const rawConf = isRejected
      ? Math.max(0, 100 - (minDistance / (adaptiveThreshold * 2.0)) * 40)
      : Math.max(0, 100 - (minDistance / adaptiveThreshold) * 20);
    const confidence = Math.round(rawConf);

    return {
      word: isRejected ? null : bestMatch ? bestMatch.word : null,
      id: isRejected ? null : bestMatch ? bestMatch.id : null,
      matchedTemplate: bestMatch ? bestMatch.word : null,
      distance: parseFloat(minDistance.toFixed(4)),
      confidence: confidence,
      isRejected: isRejected,
      thresholdUsed: adaptiveThreshold,
    };
  }

  computeDTWDistance(seqA, seqB) {
    const N = seqA.length;
    const M = seqB.length;

    const W = Math.max(6, Math.abs(N - M) + 4);

    const costMatrix = Array.from({ length: N + 1 }, () =>
      new Array(M + 1).fill(Infinity),
    );
    costMatrix[0][0] = 0;

    for (let i = 1; i <= N; i++) {
      const minJ = Math.max(1, i - W);
      const maxJ = Math.min(M, i + W);

      // Progressive Ending Trajectory Weighting
      const timeWeight = 0.6 + 0.8 * (i / N);

      for (let j = minJ; j <= maxJ; j++) {
        const frameDist =
          this.vectorDistance(seqA[i - 1], seqB[j - 1]) * timeWeight;
        const minPrev = Math.min(
          costMatrix[i - 1][j],
          costMatrix[i][j - 1],
          costMatrix[i - 1][j - 1],
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

  vectorDistance(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 1.0;

    const hand1A = vecA.slice(0, 63);
    const hand2A = vecA.slice(63, 126);
    const fingerExtA =
      vecA.length >= 136 ? vecA.slice(126, 136) : new Array(10).fill(0);

    const hand1B = vecB.slice(0, 63);
    const hand2B = vecB.slice(63, 126);
    const fingerExtB =
      vecB.length >= 136 ? vecB.slice(126, 136) : new Array(10).fill(0);

    const distHandDirect =
      this.subVectorDist(hand1A, hand1B) + this.subVectorDist(hand2A, hand2B);
    const distExtDirect = this.subVectorDist(fingerExtA, fingerExtB);

    const distHandSwapped =
      this.subVectorDist(hand1A, hand2B) + this.subVectorDist(hand2A, hand1B);
    const fingerExtSwapped = fingerExtA
      .slice(5, 10)
      .concat(fingerExtA.slice(0, 5));
    const distExtSwapped = this.subVectorDist(fingerExtSwapped, fingerExtB);

    let minHandDist = distHandDirect;
    let minExtDist = distExtDirect;
    if (distHandSwapped + distExtSwapped < distHandDirect + distExtDirect) {
      minHandDist = distHandSwapped;
      minExtDist = distExtSwapped;
    }

    const spatialA = vecA.length >= 145 ? vecA.slice(136, 145) : [];
    const spatialB = vecB.length >= 145 ? vecB.slice(136, 145) : [];
    const spatialDist = this.subVectorDist(spatialA, spatialB);

    const faceA = vecA.length >= 190 ? vecA.slice(157, 190) : [];
    const faceB = vecB.length >= 190 ? vecB.slice(157, 190) : [];
    const faceDist = this.subVectorDist(faceA, faceB);

    const hasSpatial =
      spatialA.some((v) => v !== 0) || spatialB.some((v) => v !== 0);
    const hasFace = faceA.some((v) => v !== 0) || faceB.some((v) => v !== 0);

    if (hasFace) {
      return (
        minHandDist * 0.45 +
        minExtDist * 0.2 +
        spatialDist * 0.25 +
        faceDist * 0.1
      );
    } else if (hasSpatial) {
      return minHandDist * 0.5 + minExtDist * 0.2 + spatialDist * 0.3;
    } else {
      return minHandDist * 0.55 + minExtDist * 0.3 + spatialDist * 0.15;
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = DTWClassifier;
} else {
  window.DTWClassifier = DTWClassifier;
}
