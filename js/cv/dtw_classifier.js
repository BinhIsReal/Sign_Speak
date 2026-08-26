const CONFUSION_PAIRS = new Map([
  ["Y", ["I"]],
  ["I", ["Y"]],
]);
const CPD_RATIO_THRESHOLD = 1.15; // If 2nd best distance < 115% of best distance -> apply tiebreaker

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
   * Predict gesture label for an input sequence with 3-Tier Adaptive Thresholding & Confusion Pair Disambiguation
   * @param {Array} inputSequence Array of feature frame vectors
   * @returns {Object} Prediction result { word, confidence, distance, isRejected, thresholdUsed, gestureType, confusionResolved }
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
        thresholdUsed: this.defaultThreshold,
        gestureType: "single",
        confusionResolved: false,
      };
    }

    if (this.templates.length === 0) {
      return {
        word: null,
        confidence: 0,
        distance: Infinity,
        isRejected: true,
        reason: "No templates loaded",
        thresholdUsed: this.defaultThreshold,
        gestureType: "single",
        confusionResolved: false,
      };
    }

    // Resample input sequence to uniform motion steps
    const resampledInput = this.resampleSequence(
      inputSequence,
      this.targetResampleFrames,
    );

    // Detect if input sequence is a 2-hand gesture (check if spatial features 142-150 are non-zero)
    const isTwoHandInput = resampledInput.some(
      (f) => f.length >= 151 && (f[142] !== 0 || f[143] !== 0 || f[144] !== 0),
    );

    let minDistance = Infinity;
    let secondDistance = Infinity;
    let bestMatch = null;
    let secondMatch = null;

    for (let template of this.templates) {
      const dist = this.computeDTWDistance(resampledInput, template.sequence);
      if (dist < minDistance) {
        secondDistance = minDistance;
        secondMatch = bestMatch;
        minDistance = dist;
        bestMatch = template;
      } else if (dist < secondDistance) {
        secondDistance = dist;
        secondMatch = template;
      }
    }

    // --- 3-Tier Adaptive Threshold ---
    let adaptiveThreshold = this.defaultThreshold;
    let gestureType = "single";
    if (bestMatch) {
      const isTwoHandTemplate = bestMatch.sequence.some(
        (f) => f.length >= 151 && (f[142] !== 0 || f[143] !== 0 || f[144] !== 0),
      );
      // Detect dual-hand-both-moving from input (check if both halves non-zero)
      const isDualBothMoving = resampledInput.some((f) => {
        const leftMag = f.slice(0, 63).some((v) => Math.abs(v) > 0.01);
        const rightMag = f.slice(63, 126).some((v) => Math.abs(v) > 0.01);
        return leftMag && rightMag;
      });

      if (isTwoHandTemplate && isDualBothMoving) {
        adaptiveThreshold = 0.30; // Dual-hand both moving — most relaxed
        gestureType = "dual_dynamic";
      } else if (isTwoHandTemplate || isTwoHandInput) {
        adaptiveThreshold = 0.24; // Two-hand static/asymmetric
        gestureType = "dual_static";
      } else {
        adaptiveThreshold = 0.18; // Single hand — strict
        gestureType = "single";
      }
    }

    // --- Confusion Pair Disambiguation (CPD) ---
    let confusionResolved = false;
    if (
      bestMatch &&
      secondMatch &&
      CONFUSION_PAIRS.has(bestMatch.word) &&
      CONFUSION_PAIRS.get(bestMatch.word).includes(secondMatch.word) &&
      minDistance > 0 &&
      secondDistance / minDistance < CPD_RATIO_THRESHOLD
    ) {
      // Apply tiebreaker: compare thumb direction distance specifically
      // Extract thumb direction slice (136–141) from middle frame of each sequence
      const midIdx = Math.floor(resampledInput.length / 2);
      const inputThumb =
        resampledInput[midIdx] && resampledInput[midIdx].length >= 142
          ? resampledInput[midIdx].slice(136, 142)
          : new Array(6).fill(0);
      const bestMidIdx = Math.floor(bestMatch.sequence.length / 2);
      const bestThumb =
        bestMatch.sequence[bestMidIdx] && bestMatch.sequence[bestMidIdx].length >= 142
          ? bestMatch.sequence[bestMidIdx].slice(136, 142)
          : new Array(6).fill(0);
      const secMidIdx = Math.floor(secondMatch.sequence.length / 2);
      const secThumb =
        secondMatch.sequence[secMidIdx] && secondMatch.sequence[secMidIdx].length >= 142
          ? secondMatch.sequence[secMidIdx].slice(136, 142)
          : new Array(6).fill(0);

      const distToBest = this.subVectorDist(inputThumb, bestThumb);
      const distToSec = this.subVectorDist(inputThumb, secThumb);

      if (distToSec < distToBest) {
        // CPD flips decision to secondMatch
        const temp = bestMatch;
        bestMatch = secondMatch;
        secondMatch = temp;
        minDistance = secondDistance;
        confusionResolved = true;
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
      gestureType: gestureType,
      confusionResolved: confusionResolved,
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
    const thumbDirA =
      vecA.length >= 142 ? vecA.slice(136, 142) : new Array(6).fill(0);

    const hand1B = vecB.slice(0, 63);
    const hand2B = vecB.slice(63, 126);
    const fingerExtB =
      vecB.length >= 136 ? vecB.slice(126, 136) : new Array(10).fill(0);
    const thumbDirB =
      vecB.length >= 142 ? vecB.slice(136, 142) : new Array(6).fill(0);

    const distHandDirect =
      this.subVectorDist(hand1A, hand1B) + this.subVectorDist(hand2A, hand2B);
    const distExtDirect = this.subVectorDist(fingerExtA, fingerExtB);
    const distThumbDirect = this.subVectorDist(thumbDirA, thumbDirB);

    const distHandSwapped =
      this.subVectorDist(hand1A, hand2B) + this.subVectorDist(hand2A, hand1B);
    const fingerExtSwapped = fingerExtA
      .slice(5, 10)
      .concat(fingerExtA.slice(0, 5));
    const distExtSwapped = this.subVectorDist(fingerExtSwapped, fingerExtB);
    const thumbDirSwapped = thumbDirA
      .slice(3, 6)
      .concat(thumbDirA.slice(0, 3));
    const distThumbSwapped = this.subVectorDist(thumbDirSwapped, thumbDirB);

    let minHandDist = distHandDirect;
    let minExtDist = distExtDirect;
    let minThumbDist = distThumbDirect;
    if (distHandSwapped + distExtSwapped + distThumbSwapped < distHandDirect + distExtDirect + distThumbDirect) {
      minHandDist = distHandSwapped;
      minExtDist = distExtSwapped;
      minThumbDist = distThumbSwapped;
    }

    const spatialA = vecA.length >= 151 ? vecA.slice(142, 151) : [];
    const spatialB = vecB.length >= 151 ? vecB.slice(142, 151) : [];
    const spatialDist = this.subVectorDist(spatialA, spatialB);

    const faceA = vecA.length >= 196 ? vecA.slice(163, 196) : [];
    const faceB = vecB.length >= 196 ? vecB.slice(163, 196) : [];
    const faceDist = this.subVectorDist(faceA, faceB);

    const hasSpatial =
      spatialA.some((v) => v !== 0) || spatialB.some((v) => v !== 0);
    const hasFace = faceA.some((v) => v !== 0) || faceB.some((v) => v !== 0);

    if (hasFace) {
      return (
        minHandDist * 0.40 +
        minExtDist * 0.15 +
        minThumbDist * 0.15 +
        spatialDist * 0.20 +
        faceDist * 0.10
      );
    } else if (hasSpatial) {
      return (
        minHandDist * 0.45 +
        minExtDist * 0.15 +
        minThumbDist * 0.15 +
        spatialDist * 0.25
      );
    } else {
      return (
        minHandDist * 0.45 +
        minExtDist * 0.25 +
        minThumbDist * 0.30
      );
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
