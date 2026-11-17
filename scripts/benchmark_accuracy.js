/**
 * SignSpeak Accuracy Benchmark & Confusion Matrix Analyzer (JavaScript Engine)
 * Runs LOOCV (Leave-One-Out Cross Validation) using the exact DTWClassifier
 * running in production.
 */

const fs = require('fs');
const path = require('path');
const DTWClassifier = fs.existsSync(path.join(__dirname, '../cv/dtw_classifier.js'))
  ? require('../cv/dtw_classifier')
  : require('../js/cv/dtw_classifier');
const BinaryDataset = fs.existsSync(path.join(__dirname, '../cv/binary_dataset.js'))
  ? require('../cv/binary_dataset')
  : require('../js/cv/binary_dataset');

const jsonPath = path.join(__dirname, '../assets/data/vsl_dataset.json');
const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('=== Bắt đầu đo Benchmark Chính xác & Phân tích Nhầm lẫn (LOOCV) ===');

// Flatten dataset into individual test samples
const allSamples = [];
const words = Object.keys(rawData);

for (const key of words) {
  const sampleList = rawData[key];
  if (!Array.isArray(sampleList)) continue;

  sampleList.forEach((s, idx) => {
    if (s && s.sequence && s.sequence.length >= 3) {
      allSamples.push({
        key,
        word: s.word || key,
        id: s.id || `${key}_${idx}`,
        sampleIdx: idx,
        sequence: s.sequence
      });
    }
  });
}

const totalSamples = allSamples.length;
console.log(`Đã nạp ${totalSamples} mẫu cử chỉ từ ${words.length} từ vựng.\n`);

let correctMatches = 0;
let falseRejections = 0;
let misclassifications = 0;

const confusionMatrix = {};
const perWordStats = {};

const startTime = performance.now();

// LOOCV Loop
for (let i = 0; i < totalSamples; i++) {
  const testSample = allSamples[i];

  // Training set = all samples except i
  const trainSet = [];
  for (let j = 0; j < totalSamples; j++) {
    if (i !== j) {
      trainSet.push({
        id: allSamples[j].id,
        word: allSamples[j].word,
        sequence: allSamples[j].sequence
      });
    }
  }

  // Init classifier with trainSet
  const classifier = new DTWClassifier();
  classifier.loadTemplates(trainSet);

  // Predict
  const prediction = classifier.predict(testSample.sequence);

  const targetKey = testSample.key;
  const targetWord = testSample.word;

  if (!perWordStats[targetKey]) {
    perWordStats[targetKey] = {
      word: targetWord,
      total: 0,
      correct: 0,
      rejected: 0,
      wrong: 0
    };
  }
  perWordStats[targetKey].total++;

  if (prediction.isRejected) {
    falseRejections++;
    perWordStats[targetKey].rejected++;
    const pairKey = `${targetWord} -> [Từ chối / Khoảng cách lớn]`;
    confusionMatrix[pairKey] = (confusionMatrix[pairKey] || 0) + 1;
  } else if (prediction.word === targetWord || prediction.word.toLowerCase() === targetWord.toLowerCase()) {
    correctMatches++;
    perWordStats[targetKey].correct++;
  } else {
    misclassifications++;
    perWordStats[targetKey].wrong++;
    const pairKey = `${targetWord} -> ${prediction.word}`;
    confusionMatrix[pairKey] = (confusionMatrix[pairKey] || 0) + 1;
  }
}

const duration = performance.now() - startTime;
const accuracy = (correctMatches / totalSamples) * 100;
const rejectRate = (falseRejections / totalSamples) * 100;
const errorRate = (misclassifications / totalSamples) * 100;

console.log('=======================================================');
console.log('      KẾT QUẢ CHẤM ĐIỂM CHÍNH XÁC AI (LOOCV BENCHMARK) ');
console.log('=======================================================');
console.log(`- Tổng số mẫu kiểm thử:     ${totalSamples} mẫu (${words.length} từ vựng)`);
console.log(`- Độ chính xác tuyệt đối:   ${correctMatches}/${totalSamples} (${accuracy.toFixed(2)}%)`);
console.log(`- Tỷ lệ bị nhận diện nhầm:  ${misclassifications}/${totalSamples} (${errorRate.toFixed(2)}%)`);
console.log(`- Tỷ lệ bị từ chối (Gate):  ${falseRejections}/${totalSamples} (${rejectRate.toFixed(2)}%)`);
console.log(`- Thời gian chạy benchmark: ${(duration / 1000).toFixed(2)} giây (${(duration / totalSamples).toFixed(1)} ms/mẫu)\n`);

console.log('--- TOP CÁC CẶP KÝ HIỆU BỊ NHẦM LẪN (CONFUSION PAIRS) ---');
const sortedConfusion = Object.entries(confusionMatrix).sort((a, b) => b[1] - a[1]);
if (sortedConfusion.length === 0) {
  console.log('  Không có cặp nào bị nhầm lẫn!');
} else {
  sortedConfusion.slice(0, 10).forEach(([pair, count]) => {
    console.log(`  • ${pair}: ${count} lần`);
  });
}

console.log('\n--- CHI TIẾT TỪNG TỪ VỰNG & CHỮ CÁI ---');
Object.keys(perWordStats).sort().forEach((k) => {
  const s = perWordStats[k];
  const rate = ((s.correct / s.total) * 100).toFixed(1);
  const icon = s.correct === s.total ? '✅' : (s.correct > 0 ? '⚠️' : '❌');
  console.log(`  ${icon} Từ: "${s.word}" (${k}) | Đúng: ${s.correct}/${s.total} (${rate}%) | Nhầm: ${s.wrong} | Từ chối: ${s.rejected}`);
});

console.log('\n=======================================================\n');
