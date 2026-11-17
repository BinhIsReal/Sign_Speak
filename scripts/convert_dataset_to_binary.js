/**
 * Dataset Conversion & Automated Versioning Script
 * Converts vsl_dataset.json -> vsl_dataset.bin (Float32Array contiguous tensor),
 * validates 100% lossless precision, and automates dataset versioning & hashing.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const BinaryDataset = fs.existsSync(path.join(__dirname, '../cv/binary_dataset.js'))
  ? require('../cv/binary_dataset')
  : require('../js/cv/binary_dataset');

const jsonPath = path.join(__dirname, '../assets/data/vsl_dataset.json');
const binPath = path.join(__dirname, '../assets/data/vsl_dataset.bin');
const versionPath = path.join(__dirname, '../assets/data/dataset_version.json');

console.log('=== Bắt đầu chuyển đổi Dataset & Tự động hóa Versioning ===');
console.log('Nguồn JSON:', jsonPath);

// 1. Read & parse JSON
const startTime = performance.now();
const rawJson = fs.readFileSync(jsonPath, 'utf8');
const originalDataset = JSON.parse(rawJson);
const readJsonTime = performance.now() - startTime;
console.log(`[1] Đọc và parse JSON hoàn tất trong ${readJsonTime.toFixed(1)} ms`);

// 2. Encode to binary Float32Array buffer
const encodeStart = performance.now();
const arrayBuffer = BinaryDataset.encode(originalDataset);
const encodeTime = performance.now() - encodeStart;
console.log(`[2] Mã hóa Binary Float32 hoàn tất trong ${encodeTime.toFixed(1)} ms`);

// 3. Save binary file
const nodeBuffer = Buffer.from(arrayBuffer);
fs.writeFileSync(binPath, nodeBuffer);
console.log(`[3] Đã lưu file nhị phân tại: ${binPath}`);

// 4. Decode back to verify
const decodeStart = performance.now();
const decodedDataset = BinaryDataset.decode(arrayBuffer);
const decodeTime = performance.now() - decodeStart;
console.log(`[4] Giải mã Binary sang Object hoàn tất trong ${decodeTime.toFixed(1)} ms`);

// 5. Verify Lossless Roundtrip
console.log('[5] Đang kiểm tra tính toàn vẹn dữ liệu (Bitwise Exact Match)...');
const isLossless = BinaryDataset.verifyLossless(originalDataset, decodedDataset);

if (!isLossless) {
  console.error('❌ THẤT BẠI: Dữ liệu bị sai lệch sau khi giải mã!');
  process.exit(1);
}

// 6. Calculate SHA-256 Hash and Manage Version Manifest
const currentHash = crypto.createHash('sha256').update(nodeBuffer).digest('hex');

let versionData = {
  version: '1.0.0',
  buildTimestamp: Date.now(),
  hash: '',
  totalWords: 0,
  totalSamples: 0,
  totalFrames: 0,
  binFileSize: 0
};

if (fs.existsSync(versionPath)) {
  try {
    versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  } catch (_e) {}
}

let versionBumped = false;
if (versionData.hash !== currentHash) {
  const parts = (versionData.version || '1.0.0').split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1; // Increment patch version
  versionData.version = parts.join('.');
  versionData.hash = currentHash;
  versionData.buildTimestamp = Date.now();
  versionBumped = true;
}

// Compute dataset stats
const words = Object.keys(originalDataset);
let totalSamples = 0;
let totalFrames = 0;
for (const w of words) {
  const samples = originalDataset[w];
  if (Array.isArray(samples)) {
    totalSamples += samples.length;
    for (const s of samples) {
      if (s && s.sequence) totalFrames += s.sequence.length;
    }
  }
}

const origSize = fs.statSync(jsonPath).size;
const binSize = fs.statSync(binPath).size;
const gzipBinSize = zlib.gzipSync(nodeBuffer).length;

versionData.totalWords = words.length;
versionData.totalSamples = totalSamples;
versionData.totalFrames = totalFrames;
versionData.binFileSize = binSize;
versionData.gzipSize = gzipBinSize;

fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2), 'utf8');
console.log(`[6] Đã cập nhật Version Manifest: ${versionPath} (v${versionData.version}, hash: ${currentHash.substring(0, 8)}...)`);

console.log('\n======================================================');
console.log('          KẾT QUẢ TỐI ƯU HÓA & VERSIONING DATASET     ');
console.log('======================================================');
console.log(`- Phiên bản Dataset:          v${versionData.version} ${versionBumped ? '(Đã tự động tăng version!)' : '(Giữ nguyên do không đổi nội dung)'}`);
console.log(`- Mã băm SHA-256:             ${currentHash.substring(0, 16)}...`);
console.log(`- Tổng số từ vựng:            ${words.length} từ`);
console.log(`- Tổng số mẫu cử chỉ:         ${totalSamples} mẫu (${totalFrames.toLocaleString()} frames)`);
console.log(`- Dung lượng JSON ban đầu:    ${(origSize / (1024 * 1024)).toFixed(2)} MB (${origSize.toLocaleString()} bytes)`);
console.log(`- Dung lượng Binary Float32:  ${(binSize / (1024 * 1024)).toFixed(2)} MB (${binSize.toLocaleString()} bytes)`);
console.log(`- Dung lượng khi truyền HTTP: ${(gzipBinSize / 1024).toFixed(0)} KB (${(gzipBinSize / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`- Tỷ lệ giảm dung lượng:      ${(((origSize - gzipBinSize) / origSize) * 100).toFixed(1)}%`);
console.log(`- Độ sai lệch dữ liệu:        0.000000% (Bitwise Exact Match)`);
console.log(`- Thời gian giải mã RAM:      ${decodeTime.toFixed(1)} ms`);
console.log('======================================================\n');
