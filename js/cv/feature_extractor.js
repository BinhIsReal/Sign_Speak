/**
 * FeatureExtractor for Sign_Speak Gesture Recognition
 * Extracts 126D dual-hand landmarks + 10D Finger Extension Ratios + 9D Inter-Hand Spatial Features + 12D Pose landmarks
 * Implements smooth temporal Handedness tracking, Motion Velocity Trigger, and
 * Two-Tier Sentence Boundary Segmentation with Cooldown Protection for multi-phase gestures.
 */

class FeatureExtractor {
  constructor(options = {}) {
    this.motionStartThreshold = options.motionStartThreshold || 0.008; // Sensitive gesture start trigger
    this.motionStopThreshold = options.motionStopThreshold || 0.005;   // Velocity stop threshold
    this.minFrames = options.minFrames || 4;                           // Rapid responsiveness (4 frames ~140ms)
    this.maxFrames = options.maxFrames || 35;                          // Maximum valid sequence frames
    this.stillFrameTolerance = options.stillFrameTolerance || 4;       // Allow holding hand pose without premature stop
    this.dipCooldownMs = options.dipCooldownMs || 300;                 // Short cooldown window (ms) for responsive word stream

    // State tracking
    this.lastLeftHand = null;
    this.lastRightHand = null;
    this.lastFrameVector = null;
    this.lastVelocity = 0;
    this.isRecording = false;
    this.currentSequence = [];
    this.stillCounter = 0;
    this.sentenceStillCounter = 0; // Tier 2 End-of-Sentence tracking (>1.0s still)
    this.lastBoundaryCutTime = 0;  // Timestamp of last boundary cut for cooldown protection
  }

  /**
   * Extract raw 190D Feature Vector directly from MediaPipe results
   * @param {Object} results MediaPipe output
   * @returns {Array} 190D Feature Vector
   */
  extractFeatureVector(results) {
    if (!results) return new Array(190).fill(0);

    let scale = 1.0;
    if (results.poseLandmarks && results.poseLandmarks.length >= 13 && results.poseLandmarks[11] && results.poseLandmarks[12]) {
      scale = this.euclideanDistance3D(results.poseLandmarks[11], results.poseLandmarks[12]);
    } else {
      const refLandmarks = results.leftHandLandmarks || results.rightHandLandmarks;
      if (refLandmarks && refLandmarks.length >= 10 && refLandmarks[0] && refLandmarks[9]) {
        scale = this.euclideanDistance3D(refLandmarks[0], refLandmarks[9]) * 2.5;
      }
    }
    if (scale < 0.01) scale = 1.0;

    const handData = this.extractHandLandmarks(results, scale);
    const fingerExtVec = this.extractFingerExtensionFeatures(results.leftHandLandmarks, results.rightHandLandmarks);
    const spatialVec = this.extractSpatialFeatures(results.leftHandLandmarks, results.rightHandLandmarks, scale);
    const poseVec = this.extractPoseLandmarks(results.poseLandmarks);
    const faceVec = this.extractSelectiveFaceFeatures(results.faceLandmarks, scale);

    return [...handData.left, ...handData.right, ...fingerExtVec, ...spatialVec, ...poseVec, ...faceVec];
  }

  /**
   * Process raw MediaPipe Holistic/Hands results
   * @param {Object} results MediaPipe output
   * @returns {Object} Extracted frame features and motion trigger status
   */
  processFrame(results) {
    if (!results) {
      return { vector: null, isMoving: false, velocity: 0, sequenceComplete: null, sentenceEnded: false };
    }

    const fullVector = this.extractFeatureVector(results);

    // Motion Velocity Trigger Calculation
    const velocity = this.calculateMotionVelocity(fullVector);
    const isMoving = velocity >= this.motionStartThreshold;

    let sequenceComplete = null;
    let sentenceEnded = false;
    const now = performance.now();

    // Track Tier 2 End-of-Sentence Stationary Duration (> 1.0s near zero velocity)
    if (!isMoving || velocity <= this.motionStopThreshold) {
      this.sentenceStillCounter = (this.sentenceStillCounter || 0) + 1;
    } else {
      this.sentenceStillCounter = 0;
    }

    // Tier 2 Sentence End Trigger: Hand stationary continuously for > 1.0s (10 frames at 100ms interval)
    if (this.sentenceStillCounter >= 10) {
      sentenceEnded = true;
    }

    if (!this.isRecording) {
      if (isMoving) {
        this.isRecording = true;
        this.currentSequence = [fullVector];
        this.stillCounter = 0;
      }
    } else {
      this.currentSequence.push(fullVector);

      // Tier 1 Inter-Word Boundary Detection: Detect local velocity minima / inflection point
      const prevVelocity = this.lastVelocity || velocity;
      const rawVelocityDip = (this.currentSequence.length >= 4 && velocity < 0.007 && prevVelocity > 0.010);
      
      // Cooldown Protection: Prevent splitting multi-phase gestures
      const isCooldownActive = (now - this.lastBoundaryCutTime < this.dipCooldownMs);
      const isLocalVelocityDip = rawVelocityDip && !isCooldownActive;

      if (velocity <= this.motionStopThreshold || isLocalVelocityDip) {
        this.stillCounter++;
      } else {
        this.stillCounter = 0;
      }

      // Termination or continuous gesture boundary transition (Requires >= 2 still frames ~70ms or valid dip)
      if (this.stillCounter >= 2 || isLocalVelocityDip || this.currentSequence.length >= this.maxFrames) {
        if (this.currentSequence.length >= this.minFrames) {
          // BOUNDARY TRIMMING: Trim 1 frame from start/end if sequence >= 6 to remove boundary noise
          if (this.currentSequence.length >= 6) {
            sequenceComplete = this.currentSequence.slice(1, -1);
          } else {
            sequenceComplete = [...this.currentSequence];
          }
          this.lastBoundaryCutTime = now;
        }
        // Seamlessly transition into next word segment in continuous sentence stream
        this.isRecording = isMoving;
        this.currentSequence = isMoving ? [fullVector] : [];
        this.stillCounter = 0;
      }
    }

    this.lastVelocity = velocity;
    this.lastFrameVector = fullVector;

    return {
      vector: fullVector,
      velocity: velocity,
      isMoving: isMoving,
      isRecording: this.isRecording,
      recordingProgress: this.currentSequence.length / this.maxFrames,
      sequenceComplete: sequenceComplete,
      sentenceEnded: sentenceEnded
    };
  }

  /**
   * Extract 10D Finger Extension Ratios (5D Left + 5D Right)
   */
  extractFingerExtensionFeatures(leftRaw, rightRaw) {
    const leftExt = this.calculateHandFingerExtensions(leftRaw);
    const rightExt = this.calculateHandFingerExtensions(rightRaw);
    return [...leftExt, ...rightExt];
  }

  calculateHandFingerExtensions(landmarks) {
    if (!landmarks || landmarks.length < 21) {
      return [0, 0, 0, 0, 0];
    }
    const wrist = landmarks[0];
    const fingerPairs = [
      { mcp: 1, tip: 4 },  // Thumb
      { mcp: 5, tip: 8 },  // Index
      { mcp: 9, tip: 12 }, // Middle
      { mcp: 13, tip: 16 },// Ring
      { mcp: 17, tip: 20 } // Pinky
    ];

    return fingerPairs.map(pair => {
      const distTip = this.euclideanDistance3D(landmarks[pair.tip], wrist);
      const distMcp = this.euclideanDistance3D(landmarks[pair.mcp], wrist);
      return parseFloat((distTip / (distMcp + 0.0001)).toFixed(4));
    });
  }

  /**
   * Extract 63D for left hand and 63D for right hand with temporal tracking
   */
  extractHandLandmarks(results, scale) {
    let leftRaw = results.leftHandLandmarks;
    let rightRaw = results.rightHandLandmarks;
    const poseRaw = results.poseLandmarks;

    // Temporal handedness flip prevention
    if (leftRaw && rightRaw && this.lastLeftHand && this.lastRightHand) {
      const leftDistToLastLeft = this.euclideanDistance3D(leftRaw[0], this.lastLeftHand[0]);
      const leftDistToLastRight = this.euclideanDistance3D(leftRaw[0], this.lastRightHand[0]);

      if (leftDistToLastRight < leftDistToLastLeft) {
        const temp = leftRaw;
        leftRaw = rightRaw;
        rightRaw = temp;
      }
    }

    const leftVec = this.landmarksTo63D(leftRaw, scale);
    const rightVec = this.landmarksTo63D(rightRaw, scale);

    if (leftRaw) this.lastLeftHand = leftRaw;
    if (rightRaw) this.lastRightHand = rightRaw;

    return { left: leftVec, right: rightVec };
  }

  /**
   * Convert 21 landmark array to 63D vector (x, y, z normalized relative to wrist 0 AND scaled by physical body scale)
   */
  landmarksTo63D(landmarks, scale) {
    if (!landmarks || landmarks.length === 0) {
      return new Array(63).fill(0);
    }
    const wrist = landmarks[0];
    const safeScale = scale > 0.01 ? scale : 1.0;

    const vec = [];
    for (let i = 0; i < 21; i++) {
      const lm = landmarks[i] || { x: 0, y: 0, z: 0 };
      vec.push(
        parseFloat(((lm.x - wrist.x) / safeScale).toFixed(4)),
        parseFloat(((lm.y - wrist.y) / safeScale).toFixed(4)),
        parseFloat(((lm.z - wrist.z) / safeScale).toFixed(4))
      );
    }
    return vec;
  }

  /**
   * Calculate 9D inter-hand spatial features in 3D camera space:
   * [0..2] dxWrist, dyWrist, dzWrist (Relative 3D vector from Left Wrist to Right Wrist)
   * [3] interWristDist (3D distance between wrists)
   * [4..6] dxIndex, dyIndex, dzIndex (Relative 3D vector from Left Index Tip to Right Index Tip)
   * [7] interIndexDist (3D distance between index tips)
   * [8] interThumbDist (3D distance between thumb tips)
   */
  extractSpatialFeatures(leftRaw, rightRaw, scale = 1.0) {
    if (!leftRaw || !rightRaw || leftRaw.length < 21 || rightRaw.length < 21) {
      return new Array(9).fill(0);
    }
    const safeScale = scale > 0.01 ? scale : 1.0;

    const leftWrist = leftRaw[0];
    const rightWrist = rightRaw[0];

    const dxWrist = parseFloat(((rightWrist.x - leftWrist.x) / safeScale).toFixed(4));
    const dyWrist = parseFloat(((rightWrist.y - leftWrist.y) / safeScale).toFixed(4));
    const dzWrist = parseFloat(((rightWrist.z - leftWrist.z) / safeScale).toFixed(4));
    const interWristDist = parseFloat((Math.sqrt(dxWrist * dxWrist + dyWrist * dyWrist + dzWrist * dzWrist)).toFixed(4));

    const leftIndex = leftRaw[8];
    const rightIndex = rightRaw[8];
    const dxIndex = parseFloat(((rightIndex.x - leftIndex.x) / safeScale).toFixed(4));
    const dyIndex = parseFloat(((rightIndex.y - leftIndex.y) / safeScale).toFixed(4));
    const dzIndex = parseFloat(((rightIndex.z - leftIndex.z) / safeScale).toFixed(4));
    const interIndexDist = parseFloat((Math.sqrt(dxIndex * dxIndex + dyIndex * dyIndex + dzIndex * dzIndex)).toFixed(4));

    const leftThumb = leftRaw[4];
    const rightThumb = rightRaw[4];
    const dxThumb = (rightThumb.x - leftThumb.x) / safeScale;
    const dyThumb = (rightThumb.y - leftThumb.y) / safeScale;
    const dzThumb = (rightThumb.z - leftThumb.z) / safeScale;
    const interThumbDist = parseFloat((Math.sqrt(dxThumb * dxThumb + dyThumb * dyThumb + dzThumb * dzThumb)).toFixed(4));

    return [dxWrist, dyWrist, dzWrist, interWristDist, dxIndex, dyIndex, dzIndex, interIndexDist, interThumbDist];
  }

  /**
   * Extract 12D Pose landmarks (Shoulders 11,12 & Elbows 13,14)
   */
  extractPoseLandmarks(poseLandmarks) {
    if (!poseLandmarks || poseLandmarks.length < 15) {
      return new Array(12).fill(0);
    }
    const poseIndices = [11, 12, 13, 14];
    const vec = [];
    const nose = poseLandmarks[0] || { x: 0.5, y: 0.5, z: 0 };

    for (let idx of poseIndices) {
      const lm = poseLandmarks[idx] || { x: 0, y: 0, z: 0 };
      vec.push(lm.x - nose.x, lm.y - nose.y, lm.z - nose.z);
    }
    return vec;
  }

  /**
   * Extract 33D Selective Facial Features (11 keypoints x 3D)
   * Keypoints chosen for facial expressions & mouth shapes:
   * Eyebrows: 105, 66, 107 (Left), 336, 296 (Right) -> 5 points
   * Lips & Mouth: 0 (Upper lip), 13 (Lower lip), 61 (Left corner), 291 (Right corner) -> 4 points
   * Nose & Chin: 1 (Nose tip / anchor), 152 (Chin) -> 2 points
   */
  extractSelectiveFaceFeatures(faceLandmarks, scale = 1.0) {
    if (!faceLandmarks || faceLandmarks.length < 150) {
      return new Array(33).fill(0);
    }
    const safeScale = scale > 0.01 ? scale : 1.0;
    const faceIndices = [105, 66, 107, 336, 296, 0, 13, 61, 291, 1, 152];
    const nose = faceLandmarks[1] || faceLandmarks[0] || { x: 0.5, y: 0.5, z: 0 };
    const vec = [];

    for (let idx of faceIndices) {
      const lm = faceLandmarks[idx] || { x: 0, y: 0, z: 0 };
      vec.push(
        parseFloat(((lm.x - nose.x) / safeScale).toFixed(4)),
        parseFloat(((lm.y - nose.y) / safeScale).toFixed(4)),
        parseFloat(((lm.z - nose.z) / safeScale).toFixed(4))
      );
    }
    return vec;
  }

  /**
   * Calculate velocity between current frame vector and previous frame vector
   */
  calculateMotionVelocity(currentVec) {
    if (!this.lastFrameVector || this.lastFrameVector.length !== currentVec.length) {
      return 0;
    }
    let sumSq = 0;
    const checkDims = Math.min(126, currentVec.length);
    for (let i = 0; i < checkDims; i++) {
      const diff = currentVec[i] - this.lastFrameVector[i];
      sumSq += diff * diff;
    }
    return Math.sqrt(sumSq / checkDims);
  }

  euclideanDistance3D(p1, p2) {
    if (!p1 || !p2) return 999;
    const dx = (p1.x || 0) - (p2.x || 0);
    const dy = (p1.y || 0) - (p2.y || 0);
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  resetSequence() {
    this.isRecording = false;
    this.currentSequence = [];
    this.stillCounter = 0;
    this.sentenceStillCounter = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeatureExtractor;
} else {
  window.FeatureExtractor = FeatureExtractor;
}
