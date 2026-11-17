/**
 * Standalone Node.js / Browser Test Runner for Sign_Speak CV Pipeline
 * Tests VSLDatasetAdapter, FeatureExtractor (196D), OcclusionHandler (Intentional Overlap), DTWClassifier (3-Tier & CPD), and GestureContextManager.
 */

if (typeof require !== 'undefined') {
  global.VSLDatasetAdapter = require('./vsl_dataset_adapter');
  global.FeatureExtractor = require('./feature_extractor');
  global.OcclusionHandler = require('./occlusion_handler');
  global.DTWClassifier = require('./dtw_classifier');
  global.GestureContextManager = require('./gesture_context');
  global.ClassifierEvaluator = require('./evaluate_classifier');
  global.BinaryDataset = require('./binary_dataset');
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

  // 2. Test FeatureExtractor 196D Vector Generation & Velocity
  console.log("\n--- 2. Testing FeatureExtractor (196D & Thumb Direction & Per-Hand Velocity) ---");
  const extractor = new FeatureExtractor();
  const mockHolisticResults = {
    poseLandmarks: Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0 })),
    leftHandLandmarks: Array.from({ length: 21 }, (_, i) => ({ x: 0.1 * i, y: 0.2 * i, z: 0 })),
    rightHandLandmarks: Array.from({ length: 21 }, (_, i) => ({ x: 0.1 * i + 0.5, y: 0.2 * i, z: 0 })),
    faceLandmarks: Array.from({ length: 468 }, (_, i) => ({ x: 0.05 * i, y: 0.05 * i, z: 0 }))
  };

  const processed = extractor.processFrame(mockHolisticResults);
  assert(processed.vector !== null && processed.vector.length === 196, "Feature Extractor outputs 196D vector (126D hands + 10D finger ext + 6D thumb dir + 9D spatial + 12D pose + 33D face)");
  assert(typeof processed.leftVelocity === 'number' && typeof processed.rightVelocity === 'number', "Feature Extractor calculates per-hand velocity");
  assert(typeof processed.isDualHandMoving === 'boolean', "Feature Extractor exposes isDualHandMoving flag");

  // 3. Test OcclusionHandler short-term extrapolation & Intentional Overlap
  console.log("\n--- 3. Testing OcclusionHandler (Short-Term Extrapolation & Intentional Overlap) ---");
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

  // Intentional overlap test: spatialVec with interWristDist < 0.15 and interIndexDist < 0.20
  const mockSpatialOverlap = [0, 0, 0, 0.08, 0, 0, 0, 0.12, 0];
  const overlapResult = occlusion.handleOcclusion(mockLeft, mockRightEmpty, mockPose, mockSpatialOverlap);
  assert(overlapResult.isIntentionalOverlap === true, "OcclusionHandler detects intentional overlap from spatial features");

  // 4. Test DTWClassifier with 3-Tier Thresholds, 196D Distance, and CPD
  console.log("\n--- 4. Testing DTWClassifier (3-Tier Threshold & Confusion Pair Disambiguation) ---");
  const classifier = new DTWClassifier({ maxDistanceThreshold: 0.45 });

  const seqKhong = Array.from({ length: 15 }, () => new Array(196).fill(0.1));
  const seqToi = Array.from({ length: 15 }, () => new Array(196).fill(0.9));

  classifier.loadTemplates([
    { id: "khong", word: "Không", sequence: seqKhong },
    { id: "toi", word: "Tôi", sequence: seqToi }
  ]);

  const predMatch = classifier.predict(seqKhong);
  assert(predMatch.word === "Không", "DTW Classifier correctly matches identical sequence 'Không'");
  assert(predMatch.isRejected === false, "Prediction is not rejected within threshold");
  assert(typeof predMatch.gestureType === 'string', "Prediction includes gestureType categorization");

  const seqUnknownNoise = Array.from({ length: 15 }, () => new Array(196).fill(5.0));
  const predReject = classifier.predict(seqUnknownNoise);
  assert(predReject.isRejected === true, "DTW Classifier correctly rejects unknown noisy sequence");

  // Test CPD for Y vs I
  const seqY = Array.from({ length: 15 }, () => {
    const f = new Array(196).fill(0.1);
    f[136] = 1.0; // Left thumb pointing outward
    return f;
  });
  const seqI = Array.from({ length: 15 }, () => {
    const f = new Array(196).fill(0.1);
    f[136] = 0.0; // Left thumb not pointing outward
    return f;
  });

  const cpdClassifier = new DTWClassifier({ maxDistanceThreshold: 0.35 });
  cpdClassifier.loadTemplates([
    { id: "y", word: "Y", sequence: seqY },
    { id: "i", word: "I", sequence: seqI }
  ]);
  const predY = cpdClassifier.predict(seqY);
  assert(predY.word === "Y", "DTW Classifier correctly disambiguates Y vs I");

  // 5. Test GestureContextManager
  console.log("\n--- 5. Testing GestureContextManager ---");
  const gcm = new GestureContextManager();
  const ctx = gcm.update(processed, overlapResult);
  assert(typeof ctx.activeHandCount === 'number', "GestureContextManager tracks active hand count");
  assert(typeof ctx.dominantHand === 'string', "GestureContextManager tracks dominant hand");
  assert(ctx.isOverlapping === true, "GestureContextManager syncs overlap state from OcclusionHandler");

  // 6. Test ClassifierEvaluator Threshold Tuning
  console.log("\n--- 6. Testing ClassifierEvaluator ---");
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

  // --- 7. Testing BinaryDataset (Lossless Float32 & IndexedDB Compatibility) ---
  console.log("\n--- 7. Testing BinaryDataset (Lossless Float32 & IndexedDB Compatibility) ---");
  const testDict = {
    khong: [
      { id: "khong", word: "Không", sequence: seqKhong }
    ],
    toi: [
      { id: "toi", word: "Tôi", sequence: seqToi }
    ]
  };

  const encodedBuffer = BinaryDataset.encode(testDict);
  assert(encodedBuffer instanceof ArrayBuffer, "BinaryDataset encodes dictionary to ArrayBuffer");
  assert(BinaryDataset.isBinaryDataset(encodedBuffer) === true, "BinaryDataset detects 'VSLB' magic signature");

  const decodedDict = BinaryDataset.decode(encodedBuffer);
  const isLossless = BinaryDataset.verifyLossless(testDict, decodedDict);
  assert(isLossless === true, "BinaryDataset decodes back with 100% bitwise lossless precision (0.000000% error)");

  const binClassifier = new DTWClassifier();
  const loadedCount = binClassifier.loadDataset(encodedBuffer);
  assert(loadedCount === 2, "DTWClassifier loads directly from binary ArrayBuffer");

  const binPrediction = binClassifier.predict(seqKhong);
  assert(binPrediction.word === "Không", "DTWClassifier predicts correctly from binary templates");

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
