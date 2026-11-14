import os
import cv2
import torch
import numpy as np
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()
torch.hub._TRUSTED_REPO_OWNERS = torch.hub._TRUSTED_REPO_OWNERS + ('intel-isl', 'rwightman')

midas = torch.hub.load('intel-isl/MiDaS', 'MiDaS_small')
midas.eval()
midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
transform = midas_transforms.small_transform

os.makedirs('public/photos', exist_ok=True)
os.makedirs('public/depths', exist_ok=True)

photo_list = [
    ('mem_01', 'asstes/IMG_4653.jpeg', 'Warm Evenings', 'Nov 2026'),
    ('mem_02', 'asstes/8704a9bc-bd91-4b40-ab08-607dbaea4a7c.jpeg', 'Golden Hour Smile', 'Nov 2026'),
    ('mem_03', 'asstes/IMG_3442.heic', 'Mirror Check', 'May 2026'),
    ('mem_04', 'asstes/IMG_4115.heic', 'Rooftop Peace', 'Apr 2023'),
    ('mem_05', 'asstes/IMG_4677.jpeg', 'Late Night Giggles', 'Nov 2026'),
    ('mem_06', 'asstes/IMG_4656.jpeg', 'Fairy Light Glow', 'Nov 2026'),
    ('mem_07', 'asstes/b3770985-f88a-4ef2-8b0c-2109a02d6a76.jpeg', 'Sunshine & Pines', 'Nov 2026'),
    ('mem_08', 'asstes/IMG_3444.heic', 'Grand Staircase', 'May 2026'),
    ('mem_09', 'asstes/IMG_4661.jpeg', 'Cozy Nights', 'Nov 2026'),
    ('mem_10', 'asstes/f9093a2a-7be9-42fc-8d19-bfd31ae6c2f7.jpeg', 'Butterfly Cardigan', 'Nov 2026'),
    ('mem_11', 'asstes/IMG_3446.heic', 'Iconic Duo', 'May 2026'),
    ('mem_12', 'asstes/IMG_4116.heic', 'Sunset Horizon', 'Apr 2023'),
    ('mem_13', 'asstes/IMG_4670.jpeg', 'Coffee & Tea', 'Nov 2026'),
    ('mem_14', 'asstes/IMG_4651.jpeg', 'Story Time', 'Nov 2026'),
    ('mem_15', 'asstes/IMG_4666.jpeg', 'Pure Smiles', 'Nov 2026')
]

for pid, src_path, caption, date in photo_list:
    out_photo = f'public/photos/{pid}.jpg'
    out_depth = f'public/depths/{pid}.png'

    if os.path.exists(out_photo) and os.path.exists(out_depth):
        print(f"Skipping {pid}, already exists.")
        continue

    print(f"Processing {pid} from {src_path}...")
    if src_path.lower().endswith('.heic'):
        pil_img = Image.open(src_path).convert('RGB')
        img_np = np.array(pil_img)
        img = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    else:
        img = cv2.imread(src_path)

    # Resize photo for web display (max 900px on long edge)
    h, w = img.shape[:2]
    max_dim = 900
    scale = max_dim / max(h, w)
    out_w, out_h = int(w * scale), int(h * scale)
    img_display = cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_AREA)
    cv2.imwrite(out_photo, img_display, [cv2.IMWRITE_JPEG_QUALITY, 88])

    # Depth inference
    depth_scale = 480 / max(h, w)
    dw, dh = int(w * depth_scale), int(h * depth_scale)
    img_depth_input = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (dw, dh))

    input_batch = transform(img_depth_input)
    with torch.no_grad():
        pred = midas(input_batch)
        pred = torch.nn.functional.interpolate(
            pred.unsqueeze(1),
            size=(out_h, out_w),
            mode='bicubic',
            align_corners=False,
        ).squeeze()

    depth_np = pred.cpu().numpy()
    depth_norm = (depth_np - depth_np.min()) / (depth_np.max() - depth_np.min())
    depth_uint8 = (depth_norm * 255).astype(np.uint8)
    cv2.imwrite(out_depth, depth_uint8)
    print(f"Saved {pid}")

print("All 15 photos and depths completed!")
