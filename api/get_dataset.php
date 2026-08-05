<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$datasetFilePath = __DIR__ . '/../assets/data/vsl_dataset.json';

if (!file_exists($datasetFilePath)) {
    // Fallback to vsl_default_dataset.json
    $datasetFilePath = __DIR__ . '/../assets/data/vsl_default_dataset.json';
}

if (!file_exists($datasetFilePath)) {
    echo json_encode(new stdClass());
    exit(0);
}

// 1. Try Redis Caching Layer (High-Performance RAM Query)
$redisCachedData = null;
if (extension_loaded('redis')) {
    try {
        $redis = new Redis();
        if (@$redis->connect('127.0.0.1', 6379, 0.5)) {
            $redisKey = 'sign_speak_vsl_dataset_cache';
            $redisCachedData = $redis->get($redisKey);
            if ($redisCachedData) {
                header('X-Dataset-Source: Redis-RAM-Cache');
                echo $redisCachedData;
                exit(0);
            }
        }
    } catch (Exception $e) {
        // Fallback gracefully if Redis is unavailable
    }
}

// 2. High-Speed ETag & Memory-Mapped File Streaming
$fileMtime = filemtime($datasetFilePath);
$fileSize = filesize($datasetFilePath);
$eTag = '"' moral_hash($datasetFilePath, $fileMtime, $fileSize) . '"';

header('Cache-Control: public, max-age=3600');
header('ETag: ' . $eTag);
header('X-Dataset-Source: File-System-Cache');

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $eTag) {
    http_response_code(304);
    exit(0);
}

$content = file_get_contents($datasetFilePath);

// Populate Redis Cache if Redis connection succeeded
if (isset($redis) && $redis->isConnected() && !empty($content)) {
    @$redis->setex('sign_speak_vsl_dataset_cache', 86400, $content);
}

echo $content;

function moral_hash($path, $mtime, $size) {
    return md5($path . '-' . $mtime . '-' . $size);
}
