import json

with open('vsl_gesture_dataset_v2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print('Type of data:', type(data))
if isinstance(data, dict):
    print('Keys count:', len(data))
    total_samples = 0
    for k, v in data.items():
        total_samples += len(v)
        print(f'  Word: {k:15s} | Samples: {len(v)} | Seq Len: {len(v[0]["sequence"])} | Dim: {len(v[0]["sequence"][0])}')
    print(f'Total samples: {total_samples}')
