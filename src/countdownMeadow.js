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

// 24 Deterministic Flower Configurations:
// Arranged with Crown Shyness (Canopy Stratification & Phototropic Curvature)
// 1. Existing 6 flowers (indices 0-5) retain their exact identities and baseline coordinates
// 2. Remaining 18 flowers inhabit negative 2D space (alternating high/low altitudes and leaning away from neighbors)
const FLOWER_SPECS = [
  // --- First 6 Active Flowers (Nov 14 - Nov 16) ---
  { xPct: 0.505, type: 'rose', height: 145, seed: 101, curvature: 0.0, genome: { hue: 0 } },        // 0: Centerpiece English Rose
  { xPct: 0.22,  type: 'tulip', height: 105, seed: 202, curvature: -0.06 },                          // 1: Chalice Tulip
  { xPct: 0.78,  type: 'daffodil', height: 160, seed: 303, curvature: 0.05 },                       // 2: Star Daffodil
  { xPct: 0.35,  type: 'iris', height: 185, seed: 404, curvature: -0.06 },                           // 3: Tall Purple Iris
  { xPct: 0.65,  type: 'marigold', height: 125, seed: 505, curvature: 0.06 },                       // 4: Golden Pom-Pom Marigold
  { xPct: 0.12,  type: 'sunflower', height: 215, seed: 606, curvature: -0.05 },                      // 5: Towering Left Giant Sunflower

  // --- Canopy Shyness Successional Blooms (Nov 17 - Nov 22) ---
  { xPct: 0.965, type: 'sunflower', height: 220, seed: 1313, curvature: 0.12 },                     // 6: Right Flank Towering Sunflower
  { xPct: 0.865, type: 'hibiscus', height: 165, seed: 707, curvature: 0.05 },                       // 7: Mid-tall Tropical Hibiscus
  { xPct: 0.575, type: 'iris', height: 195, seed: 1919, curvature: 0.05 },                          // 8: Soaring Tall Iris (towers above rose/marigold gap)
  { xPct: 0.05,  type: 'iris', height: 180, seed: 1212, curvature: -0.12 },                          // 9: Left Edge Framer Iris
  { xPct: 0.44,  type: 'thistle', height: 175, seed: 1616, curvature: -0.08 },                       // 10: Tall Spiny Thistle in high pocket
  { xPct: 0.69,  type: 'tulip', height: 90, seed: 909, curvature: -0.06 },                           // 11: Low Chalice Tulip nestled beneath Marigold & Daffodil
  { xPct: 0.27,  type: 'rose', height: 145, seed: 1111, curvature: 0.08 },                           // 12: Mid-tier Rose between Tulip and Iris
  { xPct: 0.165, type: 'dandelion', height: 75, seed: 808, curvature: 0.05 },                       // 13: Ground Dandelion under Sunflower canopy
  { xPct: 0.535, type: 'tulip', height: 85, seed: 1818, curvature: 0.06 },                           // 14: Low Petite Tulip nodding beside Centerpiece Rose
  { xPct: 0.395, type: 'daffodil', height: 130, seed: 1414, curvature: 0.06 },                      // 15: Mid-tier Daffodil between Iris and Thistle
  { xPct: 0.825, type: 'marigold', height: 105, seed: 1515, curvature: 0.06 },                      // 16: Low Marigold beside Daffodil
  { xPct: 0.475, type: 'dandelion', height: 70, seed: 1717, curvature: -0.05 },                      // 17: Ground Dandelion beside Rose base
  { xPct: 0.735, type: 'rose', height: 145, seed: 2020, curvature: -0.05 },                          // 18: Mid-tier Rose in open right pocket
  { xPct: 0.615, type: 'dandelion', height: 75, seed: 2222, curvature: 0.04 },                      // 19: Ground Dandelion under Iris
  { xPct: 0.085, type: 'tulip', height: 95, seed: 2121, curvature: 0.08 },                           // 20: Low Tulip between Left Iris and Sunflower
  { xPct: 0.31,  type: 'thistle', height: 110, seed: 1010, curvature: -0.06 },                      // 21: Low Thistle under Iris
  { xPct: 0.905, type: 'dandelion', height: 80, seed: 2323, curvature: -0.05 },                      // 22: Ground Dandelion clock near right Sunflower
  { xPct: 0.935, type: 'thistle', height: 130, seed: 2424, curvature: -0.06 }                       // 23: Mid Thistle completing the 24th bloom!
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
    const baseScale = isMobile ? 0.62 : 0.85;
    // When garden reaches 24 flowers, scale down slightly so all 24 flowers breathe easily
    const densityScale = count > 8 ? Math.max(0.72, 1 - (count - 8) * 0.012) : 1.0;
    const plantScale = Number((baseScale * densityScale).toFixed(2));

    // Clamp plant height to allow natural vertical stratification (35% mobile, 40% desktop)
    const maxPlantH = h * (isMobile ? 0.35 : 0.40);

    for (let i = 0; i < count; i++) {
      const spec = FLOWER_SPECS[i];
      const x = Math.max(16, Math.min(w - 16, w * spec.xPct));
      const plantH = Math.min(spec.height * plantScale, maxPlantH);

      const plant = this.garden.addPlant(x, {
        type: spec.type,
        age: 1.0, // Mature blooming flower
        bloom: 1.0,
        height: plantH,
        scale: plantScale,
        curvature: spec.curvature !== undefined ? spec.curvature : 0,
        yOffset: spec.yOffset !== undefined ? spec.yOffset * (isMobile ? 0.7 : 1.0) : 0,
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
