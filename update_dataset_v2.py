import json

with open('vsl_gesture_dataset_v2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Format each sample with unique ID and word metadata
formatted_data = {}
total_samples = 0

for word_id, samples in data.items():
    formatted_data[word_id] = []
    for idx, s in enumerate(samples):
        total_samples += 1
        formatted_data[word_id].append({
            'id': f"{word_id}_sample_{idx + 1}",
            'word': s.get('word', word_id),
            'category': s.get('category', 'Alphabet' if len(word_id) == 1 else 'Common'),
            'sequence': s['sequence']
        })

with open('assets/data/vsl_dataset.json', 'w', encoding='utf-8') as f:
    json.dump(formatted_data, f, ensure_ascii=False, indent=2)

print(f"Updated assets/data/vsl_dataset.json with {len(formatted_data)} words and {total_samples} samples!")
