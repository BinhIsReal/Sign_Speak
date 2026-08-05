import json
import math
import numpy as np

def resample_sequence(seq, target_len=20):
    if not seq or len(seq) == 0:
        return []
    
    source_len = len(seq)
    if source_len == target_len:
        return seq
    
    resampled = []
    dim = len(seq[0])
    for i in range(target_len):
        target_pos = (i / (target_len - 1)) * (source_len - 1)
        index_low = int(math.floor(target_pos))
        index_high = min(source_len - 1, int(math.ceil(target_pos)))
        weight_high = target_pos - index_low
        weight_low = 1.0 - weight_high
        
        frame_low = seq[index_low]
        frame_high = seq[index_high]
        interp_frame = [
            (frame_low[d] * weight_low) + (frame_high[d] * weight_high)
            for d in range(dim)
        ]
        resampled.append(interp_frame)
    return resampled

def sub_vector_dist(sub_a, sub_b):
    length = min(len(sub_a), len(sub_b))
    if length == 0:
        return 0.0
    sum_sq = sum((sub_a[i] - sub_b[i]) ** 2 for i in range(length))
    return math.sqrt(sum_sq / length)

def vector_distance(vec_a, vec_b):
    if not vec_a or not vec_b:
        return 1.0
    hand1_a = vec_a[0:63]
    hand2_a = vec_a[63:126]
    finger_ext_a = vec_a[126:136] if len(vec_a) >= 136 else [0]*10
    spatial_a = vec_a[136:145] if len(vec_a) >= 145 else [0]*9
    
    hand1_b = vec_b[0:63]
    hand2_b = vec_b[63:126]
    finger_ext_b = vec_b[126:136] if len(vec_b) >= 136 else [0]*10
    spatial_b = vec_b[136:145] if len(vec_b) >= 145 else [0]*9
    
    dist_direct = sub_vector_dist(hand1_a, hand1_b) + sub_vector_dist(hand2_a, hand2_b)
    dist_swapped = sub_vector_dist(hand1_a, hand2_b) + sub_vector_dist(hand2_a, hand1_b)
    min_hand_dist = min(dist_direct, dist_swapped)
    
    finger_ext_dist = sub_vector_dist(finger_ext_a, finger_ext_b)
    spatial_dist = sub_vector_dist(spatial_a, spatial_b)
    
    has_spatial = any(v != 0 for v in spatial_a) or any(v != 0 for v in spatial_b)
    if has_spatial:
        return (min_hand_dist * 0.50) + (finger_ext_dist * 0.20) + (spatial_dist * 0.30)
    else:
        return (min_hand_dist * 0.55) + (finger_ext_dist * 0.30) + (spatial_dist * 0.15)

def dtw_distance(seq_a, seq_b, weighted_end=True):
    N = len(seq_a)
    M = len(seq_b)
    W = max(6, abs(N - M) + 4)
    
    cost_matrix = np.full((N + 1, M + 1), float('inf'))
    cost_matrix[0, 0] = 0.0
    
    for i in range(1, N + 1):
        min_j = max(1, i - W)
        max_j = min(M, i + W)
        time_weight = (0.6 + 0.8 * (i / N)) if weighted_end else 1.0
        
        for j in range(min_j, max_j + 1):
            frame_dist = vector_distance(seq_a[i - 1], seq_b[j - 1]) * time_weight
            min_prev = min(
                cost_matrix[i - 1, j],
                cost_matrix[i, j - 1],
                cost_matrix[i - 1, j - 1]
            )
            cost_matrix[i, j] = frame_dist + min_prev
            
    raw_score = cost_matrix[N, M]
    if raw_score == float('inf'):
        return 999.0
    return raw_score / max(N, M)

def main():
    dataset_file = 'assets/data/vsl_default_dataset.json'
    try:
        with open(dataset_file, 'r', encoding='utf-8') as f:
            dataset = json.load(f)
    except Exception as e:
        print(f"Error loading dataset: {e}")
        return
        
    print(f"Loaded dataset with {len(dataset)} words/keys.")
    
    samples = []
    for word_id, sample_list in dataset.items():
        for idx, item in enumerate(sample_list):
            samples.append({
                'word_id': word_id,
                'word': item.get('word', word_id),
                'sample_idx': idx,
                'sequence': resample_sequence(item['sequence'], 20)
            })
            
    print(f"Total samples: {len(samples)}")

    # Leave-One-Out Cross Validation
    correct = 0
    rejected = 0
    confused = 0
    
    confusion_pairs = {}
    word_stats = {}
    
    for i, test_sample in enumerate(samples):
        min_dist = float('inf')
        best_match = None
        
        for j, train_sample in enumerate(samples):
            if i == j:
                continue
            dist = dtw_distance(test_sample['sequence'], train_sample['sequence'], weighted_end=True)
            if dist < min_dist:
                min_dist = dist
                best_match = train_sample
                
        target_word = test_sample['word']
        if target_word not in word_stats:
            word_stats[target_word] = {'total': 0, 'correct': 0, 'rejected': 0, 'wrong': 0}
        word_stats[target_word]['total'] += 1
        
        is_two_hand = any(f[136] != 0 or f[137] != 0 or f[138] != 0 for f in test_sample['sequence'] if len(f) >= 145)
        adaptive_threshold = 0.24 if is_two_hand else 0.18

        if min_dist > adaptive_threshold:
            rejected += 1
            word_stats[target_word]['rejected'] += 1
        elif best_match and best_match['word'] == target_word:
            correct += 1
            word_stats[target_word]['correct'] += 1
        else:
            confused += 1
            word_stats[target_word]['wrong'] += 1
            pred_word = best_match['word'] if best_match else 'None'
            pair_key = f"{target_word} -> {pred_word}"
            confusion_pairs[pair_key] = confusion_pairs.get(pair_key, 0) + 1

    print("\n--- LOOCV Evaluation Results ---")
    print(f"Total Samples: {len(samples)}")
    print(f"Correct Matches: {correct} ({correct/len(samples)*100:.2f}%)")
    print(f"Rejections (Gate < 80%): {rejected} ({rejected/len(samples)*100:.2f}%)")
    print(f"Wrong Matches: {confused} ({confused/len(samples)*100:.2f}%)")
    
    print("\n--- Top Confused Pairs ---")
    for pair, count in sorted(confusion_pairs.items(), key=lambda x: x[1], reverse=True)[:10]:
        safe_pair = pair.encode('ascii', 'xmlcharrefreplace').decode('utf-8')
        print(f"  {safe_pair}: {count} times")
        
    print("\n--- Accuracy & Rejection per Word ---")
    for w, st in word_stats.items():
        tot = st['total']
        acc = (st['correct'] / tot) * 100
        rej = (st['rejected'] / tot) * 100
        wrg = (st['wrong'] / tot) * 100
        safe_w = w.encode('ascii', 'xmlcharrefreplace').decode('utf-8')
        print(f"  Word: '{safe_w}' (n={tot}) | Acc: {acc:.1f}% | Rejection: {rej:.1f}% | Wrong: {wrg:.1f}%")

if __name__ == '__main__':
    main()
