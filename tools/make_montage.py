import os
import subprocess

clips = [
    ('asstes/IMG_4676.mov', 0.0, 2.2),
    ('asstes/IMG_4680.mov', 0.0, 1.7),
    ('asstes/IMG_4681.mov', 0.5, 2.5),
    ('asstes/IMG_4683.mov', 0.5, 2.5),
    ('asstes/IMG_4684.mov', 0.5, 2.5),
    ('asstes/IMG_4685.mov', 0.5, 2.5),
    ('asstes/IMG_4688.mov', 0.5, 2.5),
    ('asstes/4e56edc1773f4d7283c23b0aa4d90e1c.mp4', 2.0, 3.0)
]

os.makedirs('temp_montage', exist_ok=True)
concat_list = []

for i, (path, start, dur) in enumerate(clips):
    if not os.path.exists(path):
        continue
    out_part = f'temp_montage/part_{i}.mp4'
    cmd = [
        'ffmpeg', '-y', '-ss', str(start), '-t', str(dur),
        '-i', path,
        '-vf', 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=24',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
        '-an',
        out_part
    ]
    subprocess.run(cmd, capture_output=True)
    if os.path.exists(out_part) and os.path.getsize(out_part) > 1000:
        concat_list.append(out_part)

print(f'Prepared {len(concat_list)} clips.')

files_txt = os.path.abspath('temp_montage/files.txt')
with open(files_txt, 'w', encoding='utf-8') as f:
    for c in concat_list:
        clean_path = os.path.abspath(c).replace('\\', '/')
        f.write(f"file '{clean_path}'\n")

out_montage = 'public/montage.mp4'
concat_cmd = [
    'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
    '-i', files_txt,
    '-c', 'copy',
    '-movflags', '+faststart',
    out_montage
]
res = subprocess.run(concat_cmd, capture_output=True, text=True)

if os.path.exists(out_montage):
    print(f'Montage created successfully! Size: {os.path.getsize(out_montage)/(1024*1024):.2f} MB')
else:
    print('Failed:', res.stderr[:400])
