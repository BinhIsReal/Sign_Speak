/**
 * OcclusionHandler for Sign_Speak
 * Handles short-term hand occlusion (5-8 frames max ~0.2-0.3s)
 * Keeps last known hand positions or extrapolates using shoulder/elbow pose coordinates.
 * Includes Intentional Occlusion Detection with extended tolerance for overlapping hands.
 */

const OVERLAP_WRIST_THRESHOLD = 0.15;  // interWristDist < threshold -> hands overlapping
const OVERLAP_EXTENDED_TOLERANCE = 15; // Extend occlusion tolerance during overlap

class OcclusionHandler {
  constructor(options = {}) {
    this.maxToleranceFrames = options.maxToleranceFrames || 8; // 5-8 frames (~0.2-0.3s at 30fps)
    this.leftOcclusionCount = 0;
    this.rightOcclusionCount = 0;
    this.isIntentionalOverlap = false;
    this.overlapFrameCount = 0;

    this.lastValidLeft = new Array(63).fill(0);
    this.lastValidRight = new Array(63).fill(0);
  }

  /**
   * Process extracted hand vectors (left 63D, right 63D), pose vector (12D), and optional spatial vector (9D)
   * @param {Array} leftHandVec 63D Left hand coordinates
   * @param {Array} rightHandVec 63D Right hand coordinates
   * @param {Array} poseVec 12D Pose landmarks
   * @param {Array|null} spatialVec 9D Inter-hand spatial vector (indices 142-150)
   * @returns {Object} Imputed left/right hand vectors and occlusion metadata
   */
  handleOcclusion(leftHandVec, rightHandVec, poseVec, spatialVec = null) {
    const isLeftActive = leftHandVec.some(val => val !== 0);
    const isRightActive = rightHandVec.some(val => val !== 0);

    // Detect intentional overlap — use extended tolerance
    const overlapping = this.detectIntentionalOcclusion(spatialVec);
    if (overlapping) {
      this.isIntentionalOverlap = true;
      this.overlapFrameCount++;
    } else {
      this.isIntentionalOverlap = false;
      this.overlapFrameCount = 0;
    }
    // Apply extended tolerance during intentional overlap
    const effectiveTolerance = this.isIntentionalOverlap
      ? OVERLAP_EXTENDED_TOLERANCE
      : this.maxToleranceFrames;

    let processedLeft = [...leftHandVec];
    let processedRight = [...rightHandVec];

    let leftStatus = 'active';
    let rightStatus = 'active';

    // Handle Left Hand Occlusion
    if (!isLeftActive) {
      this.leftOcclusionCount++;
      if (this.leftOcclusionCount <= effectiveTolerance) {
        leftStatus = 'extrapolated_short_term';
        // Impute from last valid frame with subtle pose offset estimation
        processedLeft = this.extrapolateHandFromPose(this.lastValidLeft, poseVec, 'left');
      } else {
        leftStatus = 'occluded_exceeded';
        processedLeft = new Array(63).fill(0);
      }
    } else {
      this.leftOcclusionCount = 0;
      this.lastValidLeft = [...leftHandVec];
    }

    // Handle Right Hand Occlusion
    if (!isRightActive) {
      this.rightOcclusionCount++;
      if (this.rightOcclusionCount <= effectiveTolerance) {
        rightStatus = 'extrapolated_short_term';
        processedRight = this.extrapolateHandFromPose(this.lastValidRight, poseVec, 'right');
      } else {
        rightStatus = 'occluded_exceeded';
        processedRight = new Array(63).fill(0);
      }
    } else {
      this.rightOcclusionCount = 0;
      this.lastValidRight = [...rightHandVec];
    }

    const isUsable = (leftStatus !== 'occluded_exceeded') && (rightStatus !== 'occluded_exceeded');

    return {
      leftHand: processedLeft,
      rightHand: processedRight,
      leftStatus: leftStatus,
      rightStatus: rightStatus,
      isUsableSequence: isUsable,
      leftOcclusionFrames: this.leftOcclusionCount,
      rightOcclusionFrames: this.rightOcclusionCount,
      isIntentionalOverlap: this.isIntentionalOverlap,
      overlapFrameCount: this.overlapFrameCount
    };
  }

  /**
   * Detect intentional hand overlap using interWristDist from spatial features.
   * @param {Array} spatialVec 9D inter-hand spatial vector (indices 142-150 in full 196D vec)
   *   spatialVec[3] = interWristDist
   *   spatialVec[7] = interIndexDist
   * @returns {boolean}
   */
  detectIntentionalOcclusion(spatialVec) {
    if (!spatialVec || spatialVec.length < 8) return false;
    const interWristDist = spatialVec[3];
    const interIndexDist = spatialVec[7];
    // Both wrists AND index tips close -> hands are deliberately overlapping
    return interWristDist > 0 && interWristDist < OVERLAP_WRIST_THRESHOLD
        && interIndexDist > 0 && interIndexDist < 0.20;
  }

  /**
   * Extrapolate hand position using last known values + pose shoulder/elbow delta shift
   */
  extrapolateHandFromPose(lastHand, poseVec, handSide) {
    if (!lastHand || !lastHand.some(v => v !== 0)) {
      return new Array(63).fill(0);
    }

    // Pose indices: Left Shoulder(0,1,2), Right Shoulder(3,4,5), Left Elbow(6,7,8), Right Elbow(9,10,11)
    let shoulderIdx = handSide === 'left' ? 0 : 3;
    let dx = poseVec[shoulderIdx] || 0;
    let dy = poseVec[shoulderIdx + 1] || 0;
    let dz = poseVec[shoulderIdx + 2] || 0;

    const extrapolated = [];
    for (let i = 0; i < 63; i += 3) {
      extrapolated.push(
        lastHand[i] + dx * 0.05,
        lastHand[i + 1] + dy * 0.05,
        lastHand[i + 2] + dz * 0.05
      );
    }
    return extrapolated;
  }

  reset() {
    this.leftOcclusionCount = 0;
    this.rightOcclusionCount = 0;
    this.lastValidLeft = new Array(63).fill(0);
    this.lastValidRight = new Array(63).fill(0);
    this.isIntentionalOverlap = false;
    this.overlapFrameCount = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OcclusionHandler;
} else {
  window.OcclusionHandler = OcclusionHandler;
}
