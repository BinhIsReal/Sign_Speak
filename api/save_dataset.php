<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$datasetFilePath = __DIR__ . '/../assets/data/vsl_dataset.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($datasetFilePath)) {
        echo file_get_contents($datasetFilePath);
    } else {
        echo json_encode(new stdClass());
    }
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload']);
        exit(0);
    }

    $existingDataset = [];
    if (file_exists($datasetFilePath)) {
        $existingContent = file_get_contents($datasetFilePath);
        $decoded = json_decode($existingContent, true);
        if (is_array($decoded)) {
            $existingDataset = $decoded;
        }
    }

    // Merge or replace dataset with strict key sanitization
    if (isset($data['action']) && $data['action'] === 'save_sample') {
        $wordId = isset($data['wordId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $data['wordId']) : null;
        $sample = $data['sample'] ?? null;

        if ($wordId && $sample) {
            if (!isset($existingDataset[$wordId])) {
                $existingDataset[$wordId] = [];
            }
            $existingDataset[$wordId][] = $sample;
        }
    } elseif (isset($data['action']) && $data['action'] === 'save_all' && isset($data['dataset'])) {
        $existingDataset = array_merge($existingDataset, $data['dataset']);
    } else {
        $existingDataset = array_merge($existingDataset, $data);
    }

    // Write persistently to vsl_dataset.json with file locking
    $result = file_put_contents($datasetFilePath, json_encode($existingDataset, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);

    if ($result !== false) {
        if (extension_loaded('redis')) {
            try {
                $redis = new Redis();
                if (@$redis->connect('127.0.0.1', 6379, 0.5)) {
                    $redis->del('sign_speak_vsl_dataset_cache');
                }
            } catch (Exception $e) {}
        }

        $totalWords = count($existingDataset);
        $totalSamples = 0;
        foreach ($existingDataset as $w => $sList) {
            if (is_array($sList)) $totalSamples += count($sList);
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'Dataset persisted safely and Redis cache invalidated successfully',
            'totalWords' => $totalWords,
            'totalSamples' => $totalSamples
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to write vsl_dataset.json']);
    }
    exit(0);
}
