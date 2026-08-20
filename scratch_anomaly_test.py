import json
import math

def sub_dist(a, b):
    l = min(len(a), len(b))
    if l == 0: return 0
    return math.sqrt(sum((a[i] - b[i])**2 for i in range(l)) / l)

def vector_distance(vecA, vecB):
    hand1A = vecA[0:63]
    hand2A = vecA[63:126]
    fingerExtA = vecA[126:136] if len(vecA) >= 136 else [0]*10

    hand1B = vecB[0:63]
    hand2B = vecB[63:126]
    fingerExtB = vecB[126:136] if len(vecB) >= 136 else [0]*10

    distHandDirect = sub_dist(hand1A, hand1B) + sub_dist(hand2A, hand2B)
    distExtDirect = sub_dist(fingerExtA, fingerExtB)

    distHandSwapped = sub_dist(hand1A, hand2B) + sub_dist(hand2A, hand1B)
    fingerExtSwapped = fingerExtA[5:10] + fingerExtA[0:5]
    distExtSwapped = sub_dist(fingerExtSwapped, fingerExtB)

    if (distHandSwapped + distExtSwapped) < (distHandDirect + distExtDirect):
        minHand = distHandSwapped
        minExt = distExtSwapped
    else:
        minHand = distHandDirect
        minExt = distExtDirect

    spatialA = vecA[136:145] if len(vecA) >= 145 else []
    spatialB = vecB[136:145] if len(vecB) >= 145 else []
    spatialDist = sub_dist(spatialA, spatialB)

    hasSpatial = any(v != 0 for v in spatialA) or any(v != 0 for v in spatialB)

    if hasSpatial:
        return (minHand * 0.50) + (minExt * 0.20) + (spatialDist * 0.30)
    else:
        return (minHand * 0.55) + (minExt * 0.30) + (spatialDist * 0.15)

def resample(seq, target_len=20):
    if len(seq) == target_len: return seq
    source_len = len(seq)
    dim = len(seq[0])
    resampled = []
    for i in range(target_len):
        pos = (i / (target_len - 1)) * (source_len - 1)
        low = int(math.floor(pos))
        high = min(source_len - 1, int(math.ceil(pos)))
        w_high = pos - low
        w_low = 1.0 - w_high
        f_low = seq[low]
        f_high = seq[high]
        resampled.append([(f_low[d]*w_low + f_high[d]*w_high) for d in range(dim)])
    return resampled

def dtw(seqA, seqB):
    rA = resample(seqA, 20)
    rB = resample(seqB, 20)
    N, M = len(rA), len(rB)
    W = max(6, abs(N - M) + 4)
    cost = [[float('inf')] * (M + 1) for _ in range(N + 1)]
    cost[0][0] = 0
    for i in range(1, N + 1):
        minJ = max(1, i - W)
        maxJ = min(M, i + W)
        timeWeight = 0.6 + 0.8 * (i / N)
        for j in range(minJ, maxJ + 1):
            fd = vector_distance(rA[i-1], rB[j-1]) * timeWeight
            cost[i][j] = fd + min(cost[i-1][j], cost[i][j-1], cost[i-1][j-1])
    return cost[N][M] / max(N, M)

with open('assets/data/vsl_dataset.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=== AI ANOMALY / OUTLIER DETECTION REPORT ===")
for word_id, samples in data.items():
    if len(samples) < 3:
        continue
    N = len(samples)
    dist_matrix = [[0.0]*N for _ in range(N)]
    for i in range(N):
        for j in range(i+1, N):
            d = dtw(samples[i]['sequence'], samples[j]['sequence'])
            dist_matrix[i][j] = d
            dist_matrix[j][i] = d
    
    avg_dists = []
    for i in range(N):
        other_dists = [dist_matrix[i][j] for j in range(N) if j != i]
        avg_d = sum(other_dists) / len(other_dists)
        avg_dists.append(avg_d)
    
    mean_dist = sum(avg_dists) / N
    variance = sum((d - mean_dist)**2 for d in avg_dists) / N
    std_dev = math.sqrt(variance)

    outliers = []
    for i in range(N):
        # Anomaly criteria: Distance is significantly higher than peers (> 1.4x mean or > 0.22)
        if avg_dists[i] > mean_dist * 1.35 and avg_dists[i] > 0.16:
            outliers.append((i+1, avg_dists[i], samples[i]['id']))
        elif avg_dists[i] > 0.24:
            outliers.append((i+1, avg_dists[i], samples[i]['id']))
            
    if outliers:
        print(f"⚠️ Từ '{word_id}' ({N} mẫu): Mean dist = {mean_dist:.4f}")
        for idx, ad, s_id in outliers:
            print(f"   -> Mẫu #{idx} ({s_id}): Avg distance = {ad:.4f} (DỊ BIỆT)")
    else:
        print(f"✅ Từ '{word_id}' ({N} mẫu): Đồng nhất tốt! (Mean dist = {mean_dist:.4f})")
