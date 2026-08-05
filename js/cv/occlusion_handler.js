/**
 * OcclusionHandler for Sign_Speak
 * Handles short-term hand occlusion (5-8 frames max ~0.2-0.3s)
 * Keeps last known hand positions or extrapolates using shoulder/elbow pose coordinates.
 */

class OcclusionHandler {
  constructor(options = {}) {
    this.maxToleranceFrames = options.maxToleranceFrames || 8; // 5-8 frames (~0.2-0.3s at 30fps)
    this.leftOcclusionCount = 0;
    this.rightOcclusionCount = 0;

    this.lastValidLeft = new Array(63).fill(0);
    this.lastValidRight = new Array(63).fill(0);
  }

  /**
   * Process extracted hand vectors (left 63D, right 63D) and pose vector (12D)
   * @returns {Object} Imputed left/right hand vectors and occlusion metadata
   */
  handleOcclusion(leftHandVec, rightHandVec, poseVec) {
    const isLeftActive = leftHandVec.some(val => val !== 0);
    const isRightActive = rightHandVec.some(val => val !== 0);

    let processedLeft = [...leftHandVec];
    let processedRight = [...rightHandVec];

    let leftStatus = 'active';
    let rightStatus = 'active';

    // Handle Left Hand Occlusion
    if (!isLeftActive) {
      this.leftOcclusionCount++;
      if (this.leftOcclusionCount <= this.maxToleranceFrames) {
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
      if (this.rightOcclusionCount <= this.maxToleranceFrames) {
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
      rightOcclusionFrames: this.rightOcclusionCount
    };
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
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OcclusionHandler;
} else {
  window.OcclusionHandler = OcclusionHandler;
}
