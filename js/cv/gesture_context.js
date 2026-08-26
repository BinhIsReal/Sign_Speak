/**
 * GestureContextManager for Sign_Speak
 * Tracks real-time gesture context from FeatureExtractor output.
 * Provides structured context to DTWClassifier for adaptive threshold selection.
 */
class GestureContextManager {
  constructor() {
    this._gestureStartTime = null;
    this._lastContext = {
      activeHandCount: 0,
      isOverlapping: false,
      isDualHandMoving: false,
      dominantHand: 'none',
      gestureDurationMs: 0
    };
  }

  /**
   * Update context from FeatureExtractor processFrame() output and OcclusionHandler output.
   * Call this every frame AFTER processFrame() and handleOcclusion().
   *
   * @param {Object} frameResult   — output of FeatureExtractor.processFrame()
   * @param {Object} occlusionResult — output of OcclusionHandler.handleOcclusion() (nullable)
   * @returns {Object} Updated context (same shape as getContext())
   */
  update(frameResult, occlusionResult = null) {
    if (!frameResult) return this.getContext();

    const { leftVelocity = 0, rightVelocity = 0, isDualHandMoving = false, isRecording = false, vector = null } = frameResult;

    // Count active hands from velocity and vector non-zero values
    const leftActive = leftVelocity > 0.003 || (vector && vector.length >= 63 && vector.slice(0, 63).some(v => Math.abs(v) > 0.01));
    const rightActive = rightVelocity > 0.003 || (vector && vector.length >= 126 && vector.slice(63, 126).some(v => Math.abs(v) > 0.01));
    const activeHandCount = (leftActive ? 1 : 0) + (rightActive ? 1 : 0);

    // Dominant hand
    let dominantHand = 'none';
    if (leftActive && rightActive) {
      dominantHand = isDualHandMoving ? 'both' : (leftVelocity > rightVelocity ? 'left' : 'right');
    } else if (leftActive) {
      dominantHand = 'left';
    } else if (rightActive) {
      dominantHand = 'right';
    }

    // Overlap from OcclusionHandler
    const isOverlapping = occlusionResult ? !!occlusionResult.isIntentionalOverlap : false;

    // Gesture duration tracking
    if (isRecording && !this._gestureStartTime) {
      this._gestureStartTime = performance.now();
    } else if (!isRecording) {
      this._gestureStartTime = null;
    }
    const gestureDurationMs = this._gestureStartTime
      ? performance.now() - this._gestureStartTime
      : 0;

    this._lastContext = {
      activeHandCount,
      isOverlapping,
      isDualHandMoving,
      dominantHand,
      gestureDurationMs
    };

    return this._lastContext;
  }

  /**
   * Get last computed context without re-calculating.
   * @returns {Object}
   */
  getContext() {
    return { ...this._lastContext };
  }

  reset() {
    this._gestureStartTime = null;
    this._lastContext = {
      activeHandCount: 0,
      isOverlapping: false,
      isDualHandMoving: false,
      dominantHand: 'none',
      gestureDurationMs: 0
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureContextManager;
} else {
  window.GestureContextManager = GestureContextManager;
}
