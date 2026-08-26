<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$envPath = __DIR__ . '/../.env';
$supabaseUrl = "https://sljiqkenvcxtfewdfuqy.supabase.co";
$supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsamlxa2VudmN4dGZld2RmdXF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTE0NTU2MywiZXhwIjoyMTAwNzIxNTYzfQ._QBULv6aQwJvi4kVSHjCZqG7h0G3-AfDyFMIdT4tcVk";

if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2) + [NULL, NULL];
        if ($name && $value) {
            $name = trim($name);
            $value = trim($value);
            if ($name === 'SUPABASE_URL') $supabaseUrl = $value;
            if ($name === 'SUPABASE_SERVICE_ROLE_KEY') $supabaseServiceKey = $value;
        }
    }
}

$dbPath = __DIR__ . '/../assets/data/users_master.json';

function getEmptyDB() {
    return [
        'users' => [],
        'friendships' => [],
        'messages' => []
    ];
}

function loadDB($dbPath) {
    if (!file_exists($dbPath)) {
        $data = getEmptyDB();
        saveDB($dbPath, $data);
        return $data;
    }
    $content = file_get_contents($dbPath);
    $data = json_decode($content, true);
    if (!is_array($data) || !isset($data['users'])) {
        $data = getEmptyDB();
        saveDB($dbPath, $data);
    }
    return $data;
}

function saveDB($dbPath, $data) {
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    file_put_contents($dbPath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function supabaseRestRequest($url, $method = 'GET', $payload = null, $serviceKey = '') {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    
    $headers = [
        'Content-Type: application/json',
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'Prefer: return=representation'
    ];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['code' => $httpCode, 'response' => json_decode($response, true)];
}

$rawInput = file_get_contents('php://input');
$inputData = json_decode($rawInput, true);
if (!is_array($inputData)) {
    $inputData = [];
}

$action = $_GET['action'] ?? $_POST['action'] ?? $inputData['action'] ?? '';

// ACTION: PURGE ALL ACCOUNTS & PROFILES (RESET EVERYTHING CLEANLY)
if ($action === 'reset_db' || $action === 'delete_all_accounts') {
    $empty = getEmptyDB();
    saveDB($dbPath, $empty);

    // Delete all rows from Supabase profiles & friends tables
    supabaseRestRequest($supabaseUrl . '/rest/v1/friends?id=neq.00000000-0000-0000-0000-000000000000', 'DELETE', null, $supabaseServiceKey);
    supabaseRestRequest($supabaseUrl . '/rest/v1/profiles?id=neq.00000000-0000-0000-0000-000000000000', 'DELETE', null, $supabaseServiceKey);

    echo json_encode([
        'status' => 'success', 
        'message' => '🎉 Đã xóa toàn bộ tài khoản và hồ sơ người dùng sạch sẽ trên cả Supabase và Local Database!'
    ]);
    exit(0);
}

$db = loadDB($dbPath);

// ACTION: REGISTER USER
if ($action === 'register') {
    $email = strtolower(trim($inputData['email'] ?? $_POST['email'] ?? $_GET['email'] ?? ''));
    $password = trim($inputData['password'] ?? $_POST['password'] ?? $_GET['password'] ?? '');
    $displayName = trim($inputData['display_name'] ?? $_POST['display_name'] ?? $_GET['display_name'] ?? '');
    $role = trim($inputData['role'] ?? $_POST['role'] ?? $_GET['role'] ?? 'deaf');
    $username = trim($inputData['username'] ?? $_POST['username'] ?? $_GET['username'] ?? '');

    if (!$email || !$password) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Vui lòng nhập đầy đủ Email và Mật khẩu!']);
        exit(0);
    }

    foreach ($db['users'] as $u) {
        if (isset($u['email']) && strtolower(trim($u['email'])) === $email) {
            http_response_code(400);
            echo json_encode([
                'status' => 'error', 
                'message' => 'Địa chỉ Email này đã được đăng ký trước đó trên hệ thống! Vui lòng chuyển sang trang Đăng Nhập.'
            ]);
            exit(0);
        }
    }

    if (!$username) {
        $username = '@user' . rand(10000, 99999);
    }

    $newUser = [
        'id' => 'usr_' . time() . '_' . rand(100, 999),
        'email' => $email,
        'password' => $password,
        'display_name' => $displayName ?: 'Người dùng Sign Speak',
        'role' => $role,
        'username' => $username,
        'created_at' => date('c')
    ];

    $db['users'][] = $newUser;
    saveDB($dbPath, $db);

    supabaseRestRequest($supabaseUrl . '/rest/v1/profiles', 'POST', [
        'id' => $newUser['id'],
        'display_name' => $newUser['display_name'],
        'role' => $newUser['role'],
        'username' => $newUser['username']
    ], $supabaseServiceKey);

    echo json_encode(['status' => 'success', 'user' => $newUser]);
    exit(0);
}

// ACTION: LOGIN USER
if ($action === 'login') {
    $email = strtolower(trim($inputData['email'] ?? $_POST['email'] ?? $_GET['email'] ?? ''));
    $password = trim($inputData['password'] ?? $_POST['password'] ?? $_GET['password'] ?? '');

    $matched = null;
    foreach ($db['users'] as $u) {
        if (isset($u['email']) && strtolower(trim($u['email'])) === $email) {
            $matched = $u;
            break;
        }
    }

    if (!$matched) {
        http_response_code(404);
        echo json_encode([
            'status' => 'error', 
            'message' => 'Tài khoản không tồn tại trên hệ thống! Vui lòng kiểm tra lại địa chỉ Email hoặc bấm Đăng ký tài khoản mới.'
        ]);
        exit(0);
    }

    if ($matched['password'] !== $password) {
        http_response_code(401);
        echo json_encode([
            'status' => 'error', 
            'message' => 'Mật khẩu không chính xác! Vui lòng kiểm tra lại.'
        ]);
        exit(0);
    }

    echo json_encode(['status' => 'success', 'user' => $matched]);
    exit(0);
}

// ACTION: GET USERS
if ($action === 'get_users') {
    $sbRes = supabaseRestRequest($supabaseUrl . '/rest/v1/profiles?select=*', 'GET', null, $supabaseServiceKey);
    if ($sbRes['code'] === 200 && is_array($sbRes['response'])) {
        echo json_encode(['status' => 'success', 'users' => $sbRes['response']]);
        exit(0);
    }
    echo json_encode(['status' => 'success', 'users' => $db['users']]);
    exit(0);
}

// ACTION: GET FRIENDSHIPS
if ($action === 'get_friendships') {
    echo json_encode(['status' => 'success', 'friendships' => $db['friendships']]);
    exit(0);
}

// ACTION: SAVE FRIENDSHIP
if ($action === 'save_friendship') {
    $userId = $inputData['user_id'] ?? $_POST['user_id'] ?? '';
    $friendId = $inputData['friend_id'] ?? $_POST['friend_id'] ?? '';
    $status = $inputData['status'] ?? $_POST['status'] ?? 'pending_sent';

    if ($userId && $friendId) {
        $updated = false;
        foreach ($db['friendships'] as &$f) {
            if (($f['user_id'] === $userId && $f['friend_id'] === $friendId) ||
                ($f['user_id'] === $friendId && $f['friend_id'] === $userId)) {
                $f['user_id'] = $userId;
                $f['friend_id'] = $friendId;
                $f['status'] = $status;
                $updated = true;
                break;
            }
        }
        if (!$updated) {
            $db['friendships'][] = [
                'user_id' => $userId,
                'friend_id' => $friendId,
                'status' => $status
            ];
        }
        saveDB($dbPath, $db);
    }
    echo json_encode(['status' => 'success', 'friendships' => $db['friendships']]);
    exit(0);
}

// ACTION: REMOVE FRIENDSHIP
if ($action === 'remove_friendship') {
    $userId = $inputData['user_id'] ?? $_POST['user_id'] ?? '';
    $friendId = $inputData['friend_id'] ?? $_POST['friend_id'] ?? '';

    $newFriendships = [];
    foreach ($db['friendships'] as $f) {
        if (!(($f['user_id'] === $userId && $f['friend_id'] === $friendId) ||
              ($f['user_id'] === $friendId && $f['friend_id'] === $userId))) {
            $newFriendships[] = $f;
        }
    }
    $db['friendships'] = $newFriendships;
    saveDB($dbPath, $db);

    echo json_encode(['status' => 'success', 'friendships' => $db['friendships']]);
    exit(0);
}

// DEFAULT RESPONSE
echo json_encode(['status' => 'success', 'db' => $db]);
