/**
 * Empirical Evaluator for DTWClassifier (maxDistanceThreshold tuning)
 * Evaluates classifier performance across thresholds: 0.20, 0.30, 0.40, 0.50
 * Outputs accuracy, True Positive Rate (TPR), and True Reject Rate (TRR).
 */

class ClassifierEvaluator {
  constructor() {
    this.thresholdsToTest = [0.20, 0.30, 0.40, 0.50];
  }

  /**
   * Run empirical evaluation using training templates and independent test dataset
   * @param {Array} trainingTemplates Array of template objects { id, word, sequence }
   * @param {Array} testSamples Array of test objects { id, word, sequence, isUnknownGesture }
   */
  evaluate(trainingTemplates, testSamples) {
    console.log("=== Bắt đầu đo thực nghiệm maxDistanceThreshold ===");
    const results = {};

    for (let thresh of this.thresholdsToTest) {
      const classifier = new DTWClassifier({ maxDistanceThreshold: thresh });
      classifier.loadTemplates(trainingTemplates);

      let correctCount = 0;
      let truePositives = 0;
      let falsePositives = 0;
      let trueRejects = 0;
      let falseRejects = 0;
      let totalValidSamples = 0;
      let totalUnknownSamples = 0;

      testSamples.forEach(sample => {
        const pred = classifier.predict(sample.sequence);
        const isUnknown = sample.isUnknownGesture || false;

        if (isUnknown) {
          totalUnknownSamples++;
          if (pred.isRejected) {
            trueRejects++;
            correctCount++;
          } else {
            falsePositives++;
          }
        } else {
          totalValidSamples++;
          if (!pred.isRejected && pred.word === sample.word) {
            truePositives++;
            correctCount++;
          } else if (pred.isRejected) {
            falseRejects++;
          } else {
            falsePositives++;
          }
        }
      });

      const totalSamples = testSamples.length;
      const overallAccuracy = totalSamples > 0 ? (correctCount / totalSamples) * 100 : 0;
      const tpr = totalValidSamples > 0 ? (truePositives / totalValidSamples) * 100 : 0;
      const trr = totalUnknownSamples > 0 ? (trueRejects / totalUnknownSamples) * 100 : 100;

      results[thresh.toFixed(2)] = {
        threshold: thresh,
        overallAccuracy: parseFloat(overallAccuracy.toFixed(2)),
        truePositiveRate: parseFloat(tpr.toFixed(2)),
        trueRejectRate: parseFloat(trr.toFixed(2)),
        falsePositives: falsePositives,
        falseRejects: falseRejects,
        passedRequirement: overallAccuracy >= 80.0
      };
    }

    let bestThresh = null;
    let maxAcc = -1;

    Object.keys(results).forEach(key => {
      const item = results[key];
      if (item.overallAccuracy > maxAcc) {
        maxAcc = item.overallAccuracy;
        bestThresh = item.threshold;
      }
    });

    return {
      evaluationMatrix: results,
      recommendedThreshold: bestThresh,
      bestAccuracy: maxAcc,
      isBlockingGatePassed: maxAcc >= 70.0
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClassifierEvaluator;
} else {
  window.ClassifierEvaluator = ClassifierEvaluator;
}
