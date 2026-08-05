/**
 * Standalone Node.js / Browser Test Runner for Sign_Speak CV Pipeline
 * Tests VSLDatasetAdapter, FeatureExtractor, OcclusionHandler, DTWClassifier, and ClassifierEvaluator logic.
 */

if (typeof require !== 'undefined') {
  global.VSLDatasetAdapter = require('./vsl_dataset_adapter');
  global.FeatureExtractor = require('./feature_extractor');
  global.OcclusionHandler = require('./occlusion_handler');
  global.DTWClassifier = require('./dtw_classifier');
  global.ClassifierEvaluator = require('./evaluate_classifier');
}

function runCVPipelineTests() {
  console.log("\n=======================================================");
  console.log("   Sign_Speak CV Pipeline Automated Logic Verification ");
  console.log("=======================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] Test ${totalTests}: ${message}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] Test ${totalTests}: ${message}`);
    }
  }

  // 1. Test VSLDatasetAdapter
  console.log("--- 1. Testing VSLDatasetAdapter ---");
  const adapter = new VSLDatasetAdapter();
  const mockDataset = [
    { label: "khong", frames: Array.from({ length: 20 }, () => new Array(126).fill(0.1)) },
    { label: "toi", frames: Array.from({ length: 15 }, () => new Array(126).fill(0.2)) }
  ];
  const report = adapter.validateDatasetCompatibility(mockDataset);
  assert(report.isCompatible === true, "Dataset Adapter detects 126D compatibility correctly");
  assert(report.wordsFound.length === 2, "Dataset Adapter parses words correctly");

  // 2. Test FeatureExtractor 147D Vector Generation & Velocity
  console.log("\n--- 2. Testing FeatureExtractor (147D & Motion Velocity) ---");
  const extractor = new FeatureExtractor();
  const mockHolisticResults = {
    poseLandmarks: Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0 })),
    leftHandLandmarks: Array.from({ length: 21 }, (_, i) => ({ x: 0.1 * i, y: 0.2 * i, z: 0 })),
    rightHandLandmarks: Array.from({ length: 21 }, (_, i) => ({ x: 0.1 * i + 0.5, y: 0.2 * i, z: 0 }))
  };

  const processed = extractor.processFrame(mockHolisticResults);
  assert(processed.vector !== null && processed.vector.length === 147, "Feature Extractor outputs 147D vector (126D hands + 9D spatial + 12D pose)");

  // 3. Test OcclusionHandler short-term extrapolation
  console.log("\n--- 3. Testing OcclusionHandler ---");
  const occlusion = new OcclusionHandler();
  const mockLeft = new Array(63).fill(0.1);
  const mockRightEmpty = new Array(63).fill(0); // Occluded right hand
  const mockPose = new Array(12).fill(0.05);

  // Frame 1: valid right hand
  occlusion.handleOcclusion(mockLeft, mockLeft, mockPose);
  // Frame 2: right hand occluded (first frame lost)
  const occResult = occlusion.handleOcclusion(mockLeft, mockRightEmpty, mockPose);
  assert(occResult.rightStatus === 'extrapolated_short_term', "OcclusionHandler extrapolates short term loss");
  assert(occResult.isUsableSequence === true, "Sequence remains usable within 5-8 frames tolerance");

  // 4. Test DTWClassifier with Sakoe-Chiba constraint & Slot-swapped alignment
  console.log("\n--- 4. Testing DTWClassifier ---");
  const classifier = new DTWClassifier({ maxDistanceThreshold: 0.45 });

  // Generate synthetic sequence A and sequence B
  const seqKhong = Array.from({ length: 15 }, () => new Array(147).fill(0.1));
  const seqToi = Array.from({ length: 15 }, () => new Array(147).fill(0.9));

  classifier.loadTemplates([
    { id: "khong", word: "Không", sequence: seqKhong },
    { id: "toi", word: "Tôi", sequence: seqToi }
  ]);

  const predMatch = classifier.predict(seqKhong);
  assert(predMatch.word === "Không", "DTW Classifier correctly matches identical sequence 'Không'");
  assert(predMatch.isRejected === false, "Prediction is not rejected within threshold");

  const seqUnknownNoise = Array.from({ length: 15 }, () => new Array(147).fill(5.0));
  const predReject = classifier.predict(seqUnknownNoise);
  assert(predReject.isRejected === true, "DTW Classifier correctly rejects unknown noisy sequence");

  // 5. Test ClassifierEvaluator Threshold Tuning
  console.log("\n--- 5. Testing ClassifierEvaluator ---");
  const evaluator = new ClassifierEvaluator();
  const trainSet = [
    { id: "khong", word: "Không", sequence: seqKhong },
    { id: "toi", word: "Tôi", sequence: seqToi }
  ];
  const testSet = [
    { id: "khong", word: "Không", sequence: seqKhong, isUnknownGesture: false },
    { id: "toi", word: "Tôi", sequence: seqToi, isUnknownGesture: false },
    { id: "unknown", word: "Noise", sequence: seqUnknownNoise, isUnknownGesture: true }
  ];

  const evalResults = evaluator.evaluate(trainSet, testSet);
  assert(evalResults.bestAccuracy >= 70.0, "Classifier Evaluator verifies Accuracy ≥70% blocking gate condition");
  assert(evalResults.isBlockingGatePassed === true, "Blocking Gate is PASSED!");

  console.log(`\n=======================================================`);
  console.log(`   Verification Summary: ${passedTests}/${totalTests} Tests Passed`);
  console.log(`=======================================================\n`);

  return passedTests === totalTests;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = runCVPipelineTests;
  if (require.main === module) {
    runCVPipelineTests();
  }
} else {
  window.runCVPipelineTests = runCVPipelineTests;
}
