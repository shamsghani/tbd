import os
import subprocess

clips_4672_starts = [10.0, 35.0, 60.0, 85.0, 110.0, 135.0, 155.0]
other_clips = [
    ('asstes/IMG_4676.mov', 0.0, 2.2),
    ('asstes/IMG_4680.mov', 0.0, 1.7),
    ('asstes/IMG_4681.mov', 0.5, 2.5),
    ('asstes/IMG_4683.mov', 0.5, 2.5),
    ('asstes/IMG_4684.mov', 0.5, 2.5),
    ('asstes/IMG_4685.mov', 0.5, 2.5),
    ('asstes/IMG_4688.mov', 0.5, 2.5),
]

interleaved = []
for i in range(len(clips_4672_starts)):
    # 4672 clip
    interleaved.append(('asstes/IMG_4672.mov', clips_4672_starts[i], 2.2))
    # other clip
    if i < len(other_clips):
        interleaved.append(other_clips[i])

print(f"Total clips to interleave: {len(interleaved)}")

os.makedirs('temp_montage', exist_ok=True)
part_files = []

for idx, (path, start, dur) in enumerate(interleaved):
    if not os.path.exists(path):
        continue
    out_p = f"temp_montage/clip_{idx:02d}.mp4"
    cmd = [
        'ffmpeg', '-y', '-ss', str(start), '-t', str(dur),
        '-i', path,
        '-vf', 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=24',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
        '-an',
        out_p
    ]
    subprocess.run(cmd, capture_output=True)
    if os.path.exists(out_p) and os.path.getsize(out_p) > 1000:
        part_files.append(out_p)

print(f"Rendered {len(part_files)} clips.")

files_txt = os.path.abspath('temp_montage/files.txt')
with open(files_txt, 'w', encoding='utf-8') as f:
    for pf in part_files:
        clean = os.path.abspath(pf).replace('\\', '/')
        f.write(f"file '{clean}'\n")

out_montage = 'public/montage.mp4'
concat_cmd = [
    'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
    '-i', files_txt,
    '-c', 'copy',
    '-movflags', '+faststart',
    out_montage
]
subprocess.run(concat_cmd, capture_output=True)

if os.path.exists(out_montage):
    print(f"New montage created! Size: {os.path.getsize(out_montage)/(1024*1024):.2f} MB")

