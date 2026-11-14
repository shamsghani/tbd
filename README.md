# 🎂 Happy Birthday Tehrim — 3D Gaussian Splats & Celebration

A bespoke interactive 3D birthday celebration site designed for GitHub Pages. Features 3D Gaussian Splats of cherished memories, an interactive birthday cake with a blowable candle, confetti cannons, an unfolding wax-sealed letter, and background music.

---

## ✨ Features

1. **Centerpiece 3D Birthday Cake & Candle:**
   - 3D frosted cake with glowing candlelight in Three.js.
   - Click the candle or "Make a Wish & Blow" to blow out the flame with smoke particles.
   - Triggers celebratory multi-stage confetti cannons (`canvas-confetti`).

2. **3D Gaussian Splats & Spatial Memory Gallery:**
   - Real-time 3D spatial reconstruction with custom Gaussian splat alpha falloff shaders.
   - Interactive mouse orbit, zoom, and **mobile gyroscope tilt** parallax.
   - Toggle between **3D Splat**, **Point Cloud**, and **Photo** modes.
   - Fine-tune depth extrusion and splat particle size with live sliders.
   - Live video playback toggle for animated moments (car laughs).
   - Polaroid scrapbook carousel with memory dates and poetic captions.

3. **Curated Memories Included:**
   - 🌟 *Under the Fairy Lights* (November 2026 night cafe)
   - 🦋 *Golden Hour Glow* (Sunlit park in butterfly cardigan)
   - 🏛️ *The Green Staircase* (May 2026 mirror outfit check)
   - ✌️ *Rooftop at Dusk* (April 2023 city skyline peace signs)
   - 🚗 *Late Night Car Chronicles* (Candid laughter & video clip)

4. **Wax-Sealed Birthday Letter:**
   - Realistic wax seal stamped with "T".
   - Smoothly unfolds an aesthetic handwritten parchment letter.
   - Edit anytime via `index.html` or click "Personalize / Edit this note" right on the page (persists locally).

5. **Vinyl Music Player:**
   - Floating corner player with spinning vinyl disc animation.
   - Pre-loaded with *Olivia Dean — I've Seen It* (or swap with any MP3 into `public/music.mp3`).

---

## 🚀 Local Preview

The preview server is currently running at:
```
http://localhost:4173/
```

To run again in the future:
```bash
npm install
npm run dev
```

---

## 🌐 Deploying to GitHub Pages

### Method 1: Automatic GitHub Action (Recommended)
1. Push this repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: complete Tehrim 3D birthday site"
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin master
   ```
2. Go to your repo on GitHub:
   - Click **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.
   - The included `.github/workflows/deploy.yml` workflow will automatically build and publish your site!

### Method 2: Manual Deploy via gh-pages
```bash
npm run deploy
```
