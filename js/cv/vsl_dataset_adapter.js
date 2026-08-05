/**
 * VSL Dataset Adapter for Sign_Speak
 * Inspects and converts VSL Kaggle Cropped / Custom Dataset keypoint formats
 * to match MediaPipe Holistic 126D + Spatial Inter-hand Feature Extractor format.
 */

class VSLDatasetAdapter {
  constructor() {
    this.HAND_LANDMARK_COUNT = 21;
    this.COORDINATE_DIM = 3; // x, y, z
    this.EXPECTED_HAND_DIM = 63; // 21 * 3
  }

  /**
   * Validate a small batch (5-10 words) of VSL dataset samples for compatibility.
   * @param {Array|Object} rawDataset JSON array of sample gesture sequences
   * @returns {Object} Inspection report containing compatibility status and recommendations
   */
  validateDatasetCompatibility(rawDataset) {
    const report = {
      isCompatible: false,
      totalSamplesParsed: 0,
      wordsFound: [],
      frameCounts: [],
      detectedDimensions: null,
      issues: [],
      recommendations: []
    };

    if (!rawDataset || (!Array.isArray(rawDataset) && typeof rawDataset !== 'object')) {
      report.issues.push('Dữ liệu dataset không phải là mảng hoặc object JSON hợp lệ.');
      return report;
    }

    const samples = Array.isArray(rawDataset) ? rawDataset : [rawDataset];
    report.totalSamplesParsed = samples.length;

    for (let idx = 0; idx < samples.length; idx++) {
      const sample = samples[idx];
      const wordLabel = sample.label || sample.word || `sample_${idx}`;
      if (!report.wordsFound.includes(wordLabel)) {
        report.wordsFound.push(wordLabel);
      }

      // Check sequence structure (must be sequence of frames)
      const frames = sample.frames || sample.landmarks || sample;
      if (!Array.isArray(frames)) {
        report.issues.push(`Mẫu "${wordLabel}" tại index ${idx} không chứa danh sách frame hợp lệ.`);
        continue;
      }

      report.frameCounts.push(frames.length);

      if (frames.length < 5 || frames.length > 60) {
        report.issues.push(`Cảnh báo: Mẫu "${wordLabel}" có độ dài ${frames.length} frame nằm ngoài khoảng kỳ vọng (10-35 frame).`);
      }

      // Inspect frame structure
      if (frames.length > 0) {
        const firstFrame = frames[0];
        const dim = Array.isArray(firstFrame) ? firstFrame.length : Object.keys(firstFrame).length;
        if (!report.detectedDimensions) {
          report.detectedDimensions = dim;
        }
      }
    }

    // Evaluate compatibility
    if (report.detectedDimensions === 126 || report.detectedDimensions === 126 + 10 || report.detectedDimensions === 168) {
      report.isCompatible = true;
      report.recommendations.push('Dataset đạt độ tương thích cao với Feature Extractor 126D.');
    } else if (report.detectedDimensions === 42 || report.detectedDimensions === 63) {
      report.isCompatible = true;
      report.recommendations.push('Dataset chứa đặc trưng 1 tay (42D/63D). Adapter sẽ tự động bổ sung vector 0 cho tay còn lại.');
    } else {
      report.recommendations.push('Dataset cần qua bước trích xuất lại keypoint bằng MediaPipe Holistic JS để đảm bảo đồng nhất 100%.');
    }

    return report;
  }

  /**
   * Convert external frame vector to standardized 126D dual-hand format
   * @param {Array} rawFrame Vector containing raw landmark coordinates
   * @returns {Object} Standardized object { leftHand: [...63], rightHand: [...63] }
   */
  normalizeFrameFormat(rawFrame) {
    if (!Array.isArray(rawFrame)) {
      return {
        leftHand: new Array(63).fill(0),
        rightHand: new Array(63).fill(0)
      };
    }

    if (rawFrame.length >= 126) {
      return {
        leftHand: rawFrame.slice(0, 63),
        rightHand: rawFrame.slice(63, 126)
      };
    } else if (rawFrame.length >= 63) {
      return {
        leftHand: rawFrame.slice(0, 63),
        rightHand: new Array(63).fill(0)
      };
    } else {
      // Pad to 63
      const padded = [...rawFrame, ...new Array(Math.max(0, 63 - rawFrame.length)).fill(0)];
      return {
        leftHand: padded,
        rightHand: new Array(63).fill(0)
      };
    }
  }
}

// Export for browser script or ES module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VSLDatasetAdapter;
} else {
  window.VSLDatasetAdapter = VSLDatasetAdapter;
}
