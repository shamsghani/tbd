import os
import time
import cv2
import numpy as np
from PIL import Image
from transformers import pipeline

def main():
    print("Initializing Depth-Anything-V2-Small-hf...")
    t_start = time.time()
    pipe = pipeline(task="depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf")
    print(f"Pipeline ready in {time.time() - t_start:.2f}s")

    photos_dir = 'public/photos'
    depths_dir = 'public/depths'
    docs_depths_dir = 'docs/depths'
    os.makedirs(depths_dir, exist_ok=True)
    os.makedirs(docs_depths_dir, exist_ok=True)

    photo_files = sorted([f for f in os.listdir(photos_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    print(f"Found {len(photo_files)} photos to process.")

    for i, fname in enumerate(photo_files, 1):
        base_name = os.path.splitext(fname)[0]
        in_path = os.path.join(photos_dir, fname)
        out_path = os.path.join(depths_dir, f"{base_name}.png")
        out_docs_path = os.path.join(docs_depths_dir, f"{base_name}.png")

        t0 = time.time()
        raw_img = Image.open(in_path).convert('RGB')
        orig_w, orig_h = raw_img.size

        # Run inference
        depth_map = pipe(raw_img)["depth"]

        # Ensure depth array matches input dimensions exactly
        depth_np = np.array(depth_map)
        if depth_np.shape != (orig_h, orig_w):
            depth_np = cv2.resize(depth_np, (orig_w, orig_h), interpolation=cv2.INTER_CUBIC)

        # Normalize to 0-255 range
        d_min, d_max = depth_np.min(), depth_np.max()
        if d_max > d_min:
            depth_norm = (depth_np - d_min) / (d_max - d_min)
        else:
            depth_norm = np.zeros_like(depth_np)
        depth_uint8 = (depth_norm * 255.0).astype(np.uint8)

        # Save to public/depths/ and docs/depths/
        cv2.imwrite(out_path, depth_uint8)
        cv2.imwrite(out_docs_path, depth_uint8)

        elapsed = time.time() - t0
        print(f"[{i:02d}/{len(photo_files):02d}] {fname} -> {base_name}.png ({orig_w}x{orig_h}) in {elapsed:.2f}s")

    print(f"\nAll {len(photo_files)} depth maps successfully generated in {time.time() - t_start:.2f}s!")

if __name__ == '__main__':
    main()
