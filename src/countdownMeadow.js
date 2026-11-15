import { AsciiGarden } from './florametric.js';

// Progression timeline: Nov 14 23:28:00 (1 flower) -> Nov 22 00:00:00 (24 flowers)
const START_TIME = new Date(2026, 10, 14, 23, 28, 0).getTime();
const TARGET_TIME = new Date(2026, 10, 22, 0, 0, 0).getTime();

export function getFlowerCount() {
  // Support debug/preview via ?flowers=24 or ?flowers=12
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('flowers')) {
    const custom = parseInt(urlParams.get('flowers'), 10);
    if (!isNaN(custom)) return Math.min(24, Math.max(1, custom));
  }

  const now = Date.now();
  if (now <= START_TIME) return 1;
  if (now >= TARGET_TIME) return 24;

  const progress = (now - START_TIME) / (TARGET_TIME - START_TIME);
  return Math.min(24, Math.max(1, 1 + Math.floor(progress * 23)));
}

// 24 Deterministic Flower Configurations across species, palettes, and relative horizontal positions
const FLOWER_SPECS = [
  { xPct: 0.505, type: 'rose', height: 145, seed: 101, genome: { hue: 0 } },    // 1: Centerpiece blooming rose (Right now!)
  { xPct: 0.22, type: 'tulip', height: 130, seed: 202 },                       // 2
  { xPct: 0.78, type: 'daffodil', height: 140, seed: 303 },                    // 3
  { xPct: 0.35, type: 'iris', height: 155, seed: 404 },                        // 4
  { xPct: 0.65, type: 'marigold', height: 135, seed: 505 },                    // 5
  { xPct: 0.12, type: 'sunflower', height: 165, seed: 606 },                   // 6
  { xPct: 0.88, type: 'hibiscus', height: 150, seed: 707 },                    // 7
  { xPct: 0.42, type: 'dandelion', height: 125, seed: 808 },                   // 8
  { xPct: 0.58, type: 'tulip', height: 145, seed: 909 },                       // 9
  { xPct: 0.28, type: 'thistle', height: 135, seed: 1010 },                    // 10
  { xPct: 0.72, type: 'rose', height: 155, seed: 1111 },                       // 11
  { xPct: 0.06, type: 'iris', height: 160, seed: 1212 },                       // 12
  { xPct: 0.94, type: 'sunflower', height: 170, seed: 1313 },                  // 13
  { xPct: 0.18, type: 'daffodil', height: 130, seed: 1414 },                   // 14
  { xPct: 0.82, type: 'marigold', height: 140, seed: 1515 },                   // 15
  { xPct: 0.46, type: 'hibiscus', height: 150, seed: 1616 },                   // 16
  { xPct: 0.54, type: 'dandelion', height: 120, seed: 1717 },                   // 17
  { xPct: 0.32, type: 'tulip', height: 145, seed: 1818 },                      // 18
  { xPct: 0.68, type: 'iris', height: 155, seed: 1919 },                       // 19
  { xPct: 0.15, type: 'rose', height: 145, seed: 2020 },                       // 20
  { xPct: 0.85, type: 'thistle', height: 135, seed: 2121 },                    // 21
  { xPct: 0.38, type: 'daffodil', height: 140, seed: 2222 },                   // 22
  { xPct: 0.62, type: 'sunflower', height: 165, seed: 2323 },                  // 23
  { xPct: 0.485, type: 'rose', height: 175, seed: 2424 }                       // 24: Grand Golden Anthesis on midnight of 22nd!
];

export class CountdownMeadow {
  constructor(canvas) {
    this.canvas = canvas;
    if (!this.canvas) return;

    // Initialize AsciiGarden with the new Florametric 2.0 engine:
    // Rotated glyph atlas, screen-space bloom, calm breeze, transparent canvas,
    // and locked mature prime anthesis (no wilting, no senescence, no rogue reseeding).
    this.garden = new AsciiGarden(this.canvas, {
      wind: 0.35,
      gusts: false,
      palette: 'botanical',
      background: 'transparent',
      glow: true,
      glowStrength: 1.0,
      rotation: true,
      grass: true,
      soil: true,
      groundOffset: 50,
      growth: false,
      aging: false,
      flowerCycles: false,
      reproduction: false,
      immigration: false,
      interactive: false
    });

    this.populate();
    this.garden.start();

    // Responsive resize handler
    this._handleResize = () => {
      if (this.garden) {
        this.garden.resize();
        this.populate();
      }
    };
    window.addEventListener('resize', this._handleResize);
  }

  populate() {
    if (!this.garden || !this.canvas) return;
    this.garden.clear();

    const count = getFlowerCount();
    const w = this.canvas.clientWidth || window.innerWidth || 800;
    const h = this.canvas.clientHeight || window.innerHeight || 600;

    // Responsive scaling: delicate on mobile, lush on desktop, adjusts as meadow fills up
    const isMobile = w < 600;
    const baseScale = isMobile ? 0.68 : 0.85;
    // When garden reaches 24 flowers, scale down slightly so all 24 flowers breathe easily
    const densityScale = count > 8 ? Math.max(0.78, 1 - (count - 8) * 0.012) : 1.0;
    const plantScale = Number((baseScale * densityScale).toFixed(2));

    // Clamp plant height to at most 26% (mobile) or 32% (desktop) of screen height
    const maxPlantH = h * (isMobile ? 0.26 : 0.32);

    for (let i = 0; i < count; i++) {
      const spec = FLOWER_SPECS[i];
      const x = Math.max(20, Math.min(w - 20, w * spec.xPct));
      const plantH = Math.min(spec.height * plantScale, maxPlantH);

      const plant = this.garden.addPlant(x, {
        type: spec.type,
        age: 1.0, // Mature blooming flower
        bloom: 1.0,
        height: plantH,
        scale: plantScale,
        seed: spec.seed,
        genome: spec.genome || {},
        palette: spec.palette || 'botanical'
      });
      if (plant) {
        plant.setAge(1.0);
        plant.setBloom(1.0);
      }
    }
  }

  destroy() {
    window.removeEventListener('resize', this._handleResize);
    if (this.garden) {
      this.garden.stop();
      this.garden.clear();
      this.garden = null;
    }
  }
}
