<?php
/**
 * Automatic Vietnamese Audio Generator Endpoint for Sign_Speak Custom Words
 * Generates local .wav and .mp3 native Vietnamese speech files on disk automatically.
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$word = isset($_GET['word']) ? trim($_GET['word']) : (isset($_POST['word']) ? trim($_POST['word']) : '');
$slug = isset($_GET['slug']) ? trim($_GET['slug']) : (isset($_POST['slug']) ? trim($_POST['slug']) : '');

if (empty($word) || empty($slug)) {
    echo json_encode(['status' => 'error', 'message' => 'Missing word or slug parameter']);
    exit;
}

$outputDir = __DIR__ . '/../assets/media/audio';
if (!file_exists($outputDir)) {
    mkdir($outputDir, 0777, true);
}

$wavFile = $outputDir . '/' . $slug . '.wav';
$mp3File = $outputDir . '/' . $slug . '.mp3';

// Check if audio file already exists
if (file_exists($wavFile) && filesize($wavFile) > 0) {
    echo json_encode([
        'status' => 'success',
        'word' => $word,
        'slug' => $slug,
        'audio_url' => "assets/media/audio/{$slug}.wav",
        'cached' => true
    ]);
    exit;
}

$letterMap = [
    'a' => 'Á', 'b' => 'Bê', 'c' => 'Xê', 'd' => 'Dê', 'e' => 'E',
    'g' => 'Gờ', 'h' => 'Hát', 'i' => 'I ngắn', 'k' => 'Ca', 'l' => 'E-lờ',
    'm' => 'E-mờ', 'n' => 'E-nờ', 'o' => 'O', 'p' => 'Pê', 'q' => 'Quy',
    'r' => 'E-rờ', 's' => 'Ép-sờ', 't' => 'Tê', 'u' => 'U', 'v' => 'Vê',
    'x' => 'Ít-sờ', 'y' => 'Y dài'
];

$speakText = $word;
if (isset($letterMap[strtolower($word)])) {
    $speakText = $letterMap[strtolower($word)];
}

// Download stream from Google Vietnamese TTS Engine
$url = "https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=" . urlencode($speakText);
$options = [
    "http" => [
        "method" => "GET",
        "header" => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n"
    ]
];

$context = stream_context_create($options);
$audioData = @file_get_contents($url, false, $context);

if ($audioData !== false && strlen($audioData) > 0) {
    file_put_contents($wavFile, $audioData);
    file_put_contents($mp3File, $audioData);
    echo json_encode([
        'status' => 'success',
        'word' => $word,
        'slug' => $slug,
        'audio_url' => "assets/media/audio/{$slug}.wav",
        'created' => true
    ]);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Failed to download TTS audio file']);
}
