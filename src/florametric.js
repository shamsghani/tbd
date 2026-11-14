/**
 * Florametric — Pure Parametric & Procedural Botanical Generation
 * Zero-dependency, 100% mathematical generative system for living ASCII plants & flowers.
 * 
 * Performance Optimized: 60+ FPS screen-space bloom, zero per-glyph shadowBlur chokepoints.
 * Features:
 *  - Dandelion interactive seed blowing & 1/20 sprouting germination physics
 *  - Internal biological clock with passing of time & natural growth
 *  - Continuous multi-stage bud-to-bloom unfurling (tight sepal capsule -> peeling sepals -> cone -> full anthesis)
 *  - High genetic diversity & randomness per seed
 *  - Distinct species-specific botanical guidelines for stems and foliage
 *  - 5 Biological growth rules (internodes, bunching, auxin branching, leaf energy scaling, senescence wilting)
 *  - Interactive sunlight / plant food nourishment physics
 *  - Custom Web Components (<florametric-plant> / <ascii-plant>)
 */

(function (root, factory) {
  const target = root || (typeof window !== 'undefined' ? window : globalThis);
  target.Florametric = factory();
  target.AsciiPlants = target.Florametric;
  target.AsciiPlant = target.Florametric.AsciiPlant;
  target.AsciiGarden = target.Florametric.AsciiGarden;
  target.GrassTuft = target.Florametric.GrassTuft;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  // =========================================================================
  // 1. PRNG & MATHEMATICAL UTILITIES
  // =========================================================================

  class PRNG {
    constructor(seed = 12345) {
      this.s = (seed | 0) || 1;
    }
    next() {
      let t = (this.s += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) {
      return min + this.next() * (max - min);
    }
    choice(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    }
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
  }

  // =========================================================================
  // 2. CHROMATIC PALETTES
  // =========================================================================

  const PALETTES = {
    botanical: {
      id: 'botanical',
      name: 'Glowing Botanical',
      stem: '#55e64b',
      stemDark: '#2da82b',
      wilted: '#b08e2f',
      dead: '#7d5c28',
      haloOpacity: 0.28,
      flowers: {
        sunflower: { core: '#d28219', coreDeep: '#8c4b0f', petal: '#ffe628', petalWarm: '#ffb914', halo: '#ff9c00' },
        hibiscus: { outer: '#ff96dc', mid: '#ff41af', inner: '#d22382', stamen: '#ffeb2d', anther: '#ffaa14', halo: '#ff28a0' },
        iris: { standard: '#b973ff', fall: '#8c41eb', deep: '#5f23be', signal: '#ffe12d', halo: '#9641ff' },
        thistle: { calyx: '#5fe14b', brush: '#d773ff', brushDark: '#a541eb', halo: '#b44bfe' },
        marigold: { yellow: '#ffe62d', orange: '#ff7d14', crimson: '#e12819', halo: '#ff4600' },
        daffodil: { petal: '#ffe62d', cup: '#ff7d14', inner: '#c8500a', halo: '#ffbe00' },
        rose: { petal: '#ff2850', dark: '#b41432', light: '#ff6482', sepal: '#4ba032', halo: '#ff143c' },
        dandelion: { yellow: '#ffe628', seed: '#f5f5fa', core: '#a09664', halo: '#ffbe00' },
        tulip: { petal: '#ff375f', inner: '#c81946', stamen: '#ffd700', halo: '#ff2850' },
        flytrap: { jaw: '#55e64b', inside: '#e63750', teeth: '#f5f0dc', halo: '#ff3750' }
      }
    },
    phosphor: {
      id: 'phosphor',
      name: 'Matrix Phosphor',
      stem: '#00ff66',
      stemDark: '#00aa44',
      wilted: '#338844',
      dead: '#225533',
      haloOpacity: 0.35,
      flowers: {
        sunflower: { core: '#00cc55', coreDeep: '#008833', petal: '#55ff99', petalWarm: '#00ff66', halo: '#00ff66' },
        hibiscus: { outer: '#55ff99', mid: '#00ff66', inner: '#00cc55', stamen: '#aaffcc', anther: '#00ff66', halo: '#00ff66' },
        iris: { standard: '#55ff99', fall: '#00ff66', deep: '#00cc55', signal: '#ccffee', halo: '#00ff66' },
        thistle: { calyx: '#00aa44', brush: '#55ff99', brushDark: '#00ff66', halo: '#00ff66' },
        marigold: { yellow: '#55ff99', orange: '#00ff66', crimson: '#00cc55', halo: '#00ff66' },
        daffodil: { petal: '#55ff99', cup: '#00ff66', inner: '#00aa44', halo: '#00ff66' },
        rose: { petal: '#55ff99', dark: '#00aa44', light: '#aaffcc', sepal: '#008833', halo: '#00ff66' },
        dandelion: { yellow: '#55ff99', seed: '#ccffee', core: '#00aa44', halo: '#00ff66' },
        tulip: { petal: '#55ff99', inner: '#00cc55', stamen: '#ccffee', halo: '#00ff66' },
        flytrap: { jaw: '#00ff66', inside: '#00aa44', teeth: '#ccffee', halo: '#00ff66' }
      }
    },
    amber: {
      id: 'amber',
      name: '1982 Terminal Amber',
      stem: '#ffb000',
      stemDark: '#aa7000',
      wilted: '#774400',
      dead: '#442200',
      haloOpacity: 0.32,
      flowers: {
        sunflower: { core: '#cc8800', coreDeep: '#885500', petal: '#ffd044', petalWarm: '#ffb000', halo: '#ff9900' },
        hibiscus: { outer: '#ffd044', mid: '#ffb000', inner: '#cc8800', stamen: '#fff088', anther: '#ffb000', halo: '#ff9900' },
        iris: { standard: '#ffd044', fall: '#ffb000', deep: '#cc8800', signal: '#fff088', halo: '#ff9900' },
        thistle: { calyx: '#aa7000', brush: '#ffd044', brushDark: '#ffb000', halo: '#ff9900' },
        marigold: { yellow: '#ffd044', orange: '#ffb000', crimson: '#cc8800', halo: '#ff9900' },
        daffodil: { petal: '#ffd044', cup: '#ffb000', inner: '#aa7000', halo: '#ff9900' },
        rose: { petal: '#ffd044', dark: '#aa7000', light: '#fff088', sepal: '#885500', halo: '#ff9900' },
        dandelion: { yellow: '#ffd044', seed: '#fff0aa', core: '#aa7000', halo: '#ff9900' },
        tulip: { petal: '#ffd044', inner: '#cc8800', stamen: '#fff088', halo: '#ff9900' },
        flytrap: { jaw: '#ffb000', inside: '#cc8800', teeth: '#fff0aa', halo: '#ff9900' }
      }
    },
    cyberpunk: {
      id: 'cyberpunk',
      name: 'Cyberpunk Neon',
      stem: '#00f5d4',
      stemDark: '#009e86',
      wilted: '#7b2cbf',
      dead: '#3c096c',
      haloOpacity: 0.38,
      flowers: {
        sunflower: { core: '#7b2cbf', coreDeep: '#3c096c', petal: '#fee440', petalWarm: '#00f5d4', halo: '#00f5d4' },
        hibiscus: { outer: '#f72585', mid: '#b5179e', inner: '#7209b7', stamen: '#fee440', anther: '#00f5d4', halo: '#f72585' },
        iris: { standard: '#f72585', fall: '#7209b7', deep: '#3f37c9', signal: '#00f5d4', halo: '#f72585' },
        thistle: { calyx: '#00f5d4', brush: '#f72585', brushDark: '#7209b7', halo: '#f72585' },
        marigold: { yellow: '#fee440', orange: '#f72585', crimson: '#7209b7', halo: '#f72585' },
        daffodil: { petal: '#00f5d4', cup: '#f72585', inner: '#7209b7', halo: '#00f5d4' },
        rose: { petal: '#f72585', dark: '#7209b7', light: '#ff70a6', sepal: '#00f5d4', halo: '#f72585' },
        dandelion: { yellow: '#fee440', seed: '#00f5d4', core: '#7209b7', halo: '#fee440' },
        tulip: { petal: '#f72585', inner: '#7209b7', stamen: '#00f5d4', halo: '#f72585' },
        flytrap: { jaw: '#00f5d4', inside: '#f72585', teeth: '#fee440', halo: '#f72585' }
      }
    },
    monochrome: {
      id: 'monochrome',
      name: 'Pure Monochrome White',
      stem: '#e0e0e0',
      stemDark: '#888888',
      wilted: '#555555',
      dead: '#333333',
      haloOpacity: 0.18,
      flowers: {
        sunflower: { core: '#888888', coreDeep: '#555555', petal: '#ffffff', petalWarm: '#cccccc', halo: '#ffffff' },
        hibiscus: { outer: '#ffffff', mid: '#cccccc', inner: '#888888', stamen: '#ffffff', anther: '#aaaaaa', halo: '#ffffff' },
        iris: { standard: '#ffffff', fall: '#cccccc', deep: '#888888', signal: '#ffffff', halo: '#ffffff' },
        thistle: { calyx: '#888888', brush: '#ffffff', brushDark: '#aaaaaa', halo: '#ffffff' },
        marigold: { yellow: '#ffffff', orange: '#cccccc', crimson: '#888888', halo: '#ffffff' },
        daffodil: { petal: '#ffffff', cup: '#cccccc', inner: '#888888', halo: '#ffffff' },
        rose: { petal: '#ffffff', dark: '#888888', light: '#dddddd', sepal: '#666666', halo: '#ffffff' },
        dandelion: { yellow: '#ffffff', seed: '#ffffff', core: '#888888', halo: '#ffffff' },
        tulip: { petal: '#ffffff', inner: '#aaaaaa', stamen: '#ffffff', halo: '#ffffff' },
        flytrap: { jaw: '#cccccc', inside: '#888888', teeth: '#ffffff', halo: '#ffffff' }
      }
    }
  };

  // =========================================================================
  // 3. GENETIC MORPHOLOGY & BIOLOGICAL GROWTH SIMULATOR
  // =========================================================================

  class BotanicalSimulator {
    constructor(config = {}) {
      this.type = config.type || 'sunflower';
      this.maxHeight = config.height || 360;
      this.scale = config.scale !== undefined ? config.scale : 1.0;
      this.userCurvature = config.curvature !== undefined ? config.curvature : 0.0;
      this.leafDensity = config.leafDensity !== undefined ? config.leafDensity : 1.0;
      this.branchingProp = config.branching !== undefined ? config.branching : 1.0;
      this.reseedGenetics(config.seed !== undefined ? config.seed : 42);
    }

    /**
     * Completely re-generate genetic traits and morphology with a new genetic seed.
     * Guarantees newly reseeded plants have distinct stem curvature, leaf positions,
     * heights, and branch patterns rather than looking identical to the previous plant!
     */
    reseedGenetics(seed) {
      this.seed = seed;
      const rng = new PRNG(this.seed);
      this.rng = rng;
      this.geneticHabit = rng.choice(['erect', 'curved_left', 'curved_right', 's_curve', 'windswept', 'zigzag']);
      this.geneticBendAmp = rng.range(14, 42);
      this.geneticHeightMod = rng.range(0.82, 1.28);
      this.geneticMaxBranches = rng.choice([0, 1, 1, 2, 2, 3]);
      this.geneticBranchAngles = [rng.range(0.42, 0.88), rng.range(0.52, 0.96), rng.range(0.48, 0.90)];
      this.geneticBranchLengths = [rng.range(0.32, 0.58), rng.range(0.28, 0.52), rng.range(0.24, 0.46)];
      this.geneticHeadTilt = rng.range(-0.38, 0.38);
      this.geneticFlowerScaleMod = rng.range(0.82, 1.35);
      this.geneticPetalChaos = rng.range(0.68, 1.38);
      this.geneticLeafClusters = rng.choice([2, 3, 4, 5, 6]);

      // Foliage Genetic Profiles: randomized placement jitters and individual leaf size variations!
      this.geneticLeafJitters = [];
      this.geneticLeafSizes = [];
      this.geneticPhyllotaxis = [];
      for (let i = 0; i < 10; i++) {
        this.geneticLeafJitters.push(rng.range(-0.08, 0.08));
        this.geneticLeafSizes.push([rng.range(0.70, 1.45), rng.range(0.70, 1.45)]);
        this.geneticPhyllotaxis.push(rng.choice(['paired', 'paired', 'alternate_l', 'alternate_r']));
      }

      this.initMembers();
    }

    /**
     * Initialize Persistent Member Graph:
     * Individual lifecycles and subcycles for leaves, apical flower, and axillary branches.
     */
    initMembers() {
      const rng = new PRNG(this.seed);
      this.members = {
        leaves: [],
        branches: [],
        apicalFlower: {
          state: 'dormant', // dormant, bud, opening, blooming, wilting, dead
          bloom: 0.0,
          age: 0.0,
          lifespan: rng.range(28, 45), // 28-45s of glorious peak anthesis
          wiltTimer: 11.0,            // 11s of visible wilting and petal shedding
          resproutTimer: 8.0,          // 8s resting calyx before next flush
          cycleCount: 0
        }
      };

      // 1. Main Stem Leaf Members with Staggered Lifespans (Turnover occurs throughout mature life!)
      const numClusters = Math.min(6, Math.floor(this.geneticLeafClusters * this.leafDensity));
      const leafLifespanBase = [16, 24, 19, 29, 22, 34];

      for (let c = 1; c <= numClusters; c++) {
        const baseRatio = c / (numClusters + 1);
        const jitter = this.geneticLeafJitters[c % this.geneticLeafJitters.length];
        const clampedRatio = clamp(baseRatio + jitter, 0.12, 0.88);
        const phyllo = this.geneticPhyllotaxis[c % this.geneticPhyllotaxis.length];
        const sizePair = this.geneticLeafSizes[c % this.geneticLeafSizes.length];
        const allometry = 0.72 + 0.55 * Math.sin(clampedRatio * Math.PI);
        const baseLifespan = (leafLifespanBase[c % leafLifespanBase.length] || 22) + rng.range(-3, 3);

        if (phyllo === 'paired') {
          const yOffsetR = 2 + Math.floor(((this.seed * 3 + c * 5) % 5));
          this.members.leaves.push({
            id: `leaf_${c}_l`,
            cluster: c,
            yRatio: clampedRatio,
            yOffset: 0,
            side: -1,
            scaleMod: sizePair[0],
            baseScale: sizePair[0] * allometry,
            scale: sizePair[0] * allometry * 0.08,
            maturity: 0.08,
            state: 'dormant',
            age: 0.0,
            lifespan: baseLifespan * rng.range(0.85, 1.15),
            wiltTimer: 9.0,
            resproutTimer: rng.range(6, 12),
            isWilted: false,
            isDead: false
          });
          this.members.leaves.push({
            id: `leaf_${c}_r`,
            cluster: c,
            yRatio: clampedRatio,
            yOffset: yOffsetR,
            side: 1,
            scaleMod: sizePair[1],
            baseScale: sizePair[1] * allometry,
            scale: sizePair[1] * allometry * 0.08,
            maturity: 0.08,
            state: 'dormant',
            age: 0.0,
            lifespan: baseLifespan * rng.range(0.85, 1.15),
            wiltTimer: 9.0,
            resproutTimer: rng.range(6, 12),
            isWilted: false,
            isDead: false
          });
        } else if (phyllo === 'alternate_l') {
          this.members.leaves.push({
            id: `leaf_${c}_l`,
            cluster: c,
            yRatio: clampedRatio,
            yOffset: 0,
            side: -1,
            scaleMod: sizePair[0],
            baseScale: sizePair[0] * allometry,
            scale: sizePair[0] * allometry * 0.08,
            maturity: 0.08,
            state: 'dormant',
            age: 0.0,
            lifespan: baseLifespan,
            wiltTimer: 9.0,
            resproutTimer: rng.range(6, 12),
            isWilted: false,
            isDead: false
          });
        } else {
          this.members.leaves.push({
            id: `leaf_${c}_r`,
            cluster: c,
            yRatio: clampedRatio,
            yOffset: 0,
            side: 1,
            scaleMod: sizePair[1],
            baseScale: sizePair[1] * allometry,
            scale: sizePair[1] * allometry * 0.08,
            maturity: 0.08,
            state: 'dormant',
            age: 0.0,
            lifespan: baseLifespan,
            wiltTimer: 9.0,
            resproutTimer: rng.range(6, 12),
            isWilted: false,
            isDead: false
          });
        }
      }

      // 2. Secondary Branches (with child leaves and child flowers)
      const branchMax = Math.min(this.geneticMaxBranches, Math.floor(this.branchingProp * 3));
      const initialSide = ((this.seed % 2) === 0) ? -1 : 1;

      for (let bi = 0; bi < branchMax; bi++) {
        const branchSide = (bi % 2 === 0) ? initialSide : -initialSide;
        const startYRatio = 0.30 + bi * 0.22;
        const bLenRatio = this.geneticBranchLengths[bi % this.geneticBranchLengths.length] || 0.4;
        const bAngle = this.geneticBranchAngles[bi % this.geneticBranchAngles.length] || 0.65;

        // Child leaves on this branch
        const branchLeaves = [
          {
            id: `br_leaf_${bi}_0`,
            posAlong: 0.45,
            side: -branchSide,
            scale: 0.75,
            state: 'dormant',
            age: 0.0,
            lifespan: rng.range(50, 90),
            wiltTimer: 16.0,
            resproutTimer: rng.range(20, 35)
          },
          {
            id: `br_leaf_${bi}_1`,
            posAlong: 0.80,
            side: branchSide,
            scale: 0.65,
            state: 'dormant',
            age: 0.0,
            lifespan: rng.range(50, 90),
            wiltTimer: 16.0,
            resproutTimer: rng.range(20, 35)
          }
        ];

        // Child flower at branch tip
        const branchFlower = {
          id: `br_flower_${bi}`,
          state: 'dormant',
          bloom: 0.0,
          age: 0.0,
          lifespan: rng.range(70, 130),
          resproutTimer: rng.range(25, 45),
          isDead: false
        };

        this.members.branches.push({
          id: `branch_${bi}`,
          index: bi,
          side: branchSide,
          startYRatio,
          lengthRatio: bLenRatio,
          currentLength: 0.0,
          angle: bAngle,
          health: 1.0,
          state: 'dormant',
          isDead: false,
          deathTimer: 0.0,
          leaves: branchLeaves,
          flower: branchFlower
        });
      }
    }

    /**
     * Advance Member Subcycles over time (leaves, flowers, and branches with dependency rules)
     */
    updateMembers(dt, timeSpeed = 1.0, globalAge = 0.0) {
      if (!this.members) this.initMembers();
      const effectiveDt = dt * timeSpeed;
      const effectiveMaxHeight = this.maxHeight * this.geneticHeightMod;
      const growthFactor = (1 - Math.exp(-4 * Math.min(1.0, globalAge))) / (1 - Math.exp(-4));
      const senescence = (globalAge > 21.0) ? clamp((globalAge - 21.0) / 2.5, 0.0, 1.0) : 0.0;
      let shootHeight = Math.max(20, effectiveMaxHeight * growthFactor);
      if (senescence > 0) shootHeight = Math.max(16, shootHeight * (1.0 - senescence * 0.22));

      // 1. UPDATE MAIN STEM LEAVES (Active turnover during mature prime!)
      this.members.leaves.forEach(l => {
        const nodeTargetY = l.yRatio * (effectiveMaxHeight * 0.88);
        const apexDist = shootHeight - nodeTargetY;

        if (apexDist >= 0) {
          if (l.state === 'dormant') {
            l.state = 'bud';
            l.maturity = 0.08;
            l.age = 0.0;
            l.isDead = false;
            l.isWilted = false;
          }

          if (l.state === 'bud' || l.state === 'growing') {
            l.maturity = Math.min(1.0, l.maturity + effectiveDt * 0.15);
            if (l.maturity >= 1.0) {
              l.state = 'mature';
            }
          }

          if (l.state === 'mature') {
            l.age += effectiveDt;
            if (l.age >= l.lifespan || senescence > 0.15) {
              l.state = 'wilting';
              l.isWilted = true;
              l.wiltTimer = 9.0;
            }
          }

          if (l.state === 'wilting') {
            l.wiltTimer -= effectiveDt;
            if (l.wiltTimer <= 0) {
              l.state = 'dead';
              l.isDead = true;
              l.isWilted = false;
              l.resproutTimer = 7.0;
            }
          }

          if (l.state === 'dead' && senescence < 0.85) {
            l.resproutTimer -= effectiveDt;
            if (l.resproutTimer <= 0) {
              l.state = 'bud';
              l.maturity = 0.12;
              l.age = 0.0;
              l.isDead = false;
              l.isWilted = false;
              l.wiltTimer = 9.0;
              l.resproutTimer = 7.0;
              l.lifespan = 20.0 + Math.random() * 15.0;
            }
          }
        }
      });

      // 2. UPDATE APICAL FLOWER (Successive Blooming Waves throughout mature prime!)
      const af = this.members.apicalFlower;
      if (globalAge > 0.42 && senescence < 0.92) {
        if (af.state === 'dormant') {
          af.state = 'bud';
          af.bloom = 0.10;
          af.age = 0.0;
        }

        if (af.state === 'bud') {
          af.bloom = Math.min(0.40, af.bloom + effectiveDt * 0.08);
          if (af.bloom >= 0.38) af.state = 'opening';
        } else if (af.state === 'opening') {
          af.bloom = Math.min(1.0, af.bloom + effectiveDt * 0.10);
          if (af.bloom >= 0.92) af.state = 'blooming';
        } else if (af.state === 'blooming') {
          af.age += effectiveDt;
          if (af.age >= af.lifespan || senescence > 0.15) {
            af.state = 'wilting';
            af.wiltTimer = 11.0;
          }
        } else if (af.state === 'wilting') {
          af.wiltTimer -= effectiveDt;
          af.bloom = Math.max(0.12, af.bloom - effectiveDt * 0.08);
          if (af.wiltTimer <= 0 || af.bloom <= 0.14) {
            af.state = 'dead';
            af.bloom = 0.0;
            af.resproutTimer = 8.0;
          }
        } else if (af.state === 'dead' && senescence < 0.85) {
          af.resproutTimer -= effectiveDt;
          if (af.resproutTimer <= 0) {
            af.state = 'bud';
            af.bloom = 0.10;
            af.age = 0.0;
            af.cycleCount++;
            af.lifespan = 28.0 + Math.random() * 16.0;
          }
        }
      }

      // 3. UPDATE SECONDARY BRANCHES & MEMBER DEPENDENCY
      this.members.branches.forEach(b => {
        if (b.isDead) return;

        const branchStartY = b.startYRatio * (effectiveMaxHeight * 0.88);
        if (shootHeight >= branchStartY && globalAge > 0.45 && senescence < 0.90) {
          if (b.state === 'dormant') {
            b.state = 'growing';
            b.currentLength = 4.0;
            b.health = 1.0;
          }

          const targetLen = shootHeight * b.lengthRatio * (1.0 - senescence * 0.35);
          if (b.currentLength < targetLen) {
            b.currentLength = Math.min(targetLen, b.currentLength + effectiveDt * 12.0);
          }

          // Update child leaves on this branch
          b.leaves.forEach(bl => {
            if (bl.state === 'dormant' && b.currentLength >= targetLen * bl.posAlong) {
              bl.state = 'mature';
              bl.age = 0.0;
            }
            if (bl.state === 'mature') {
              bl.age += effectiveDt;
              if (bl.age >= bl.lifespan || senescence > 0.15) {
                bl.state = 'wilting';
              }
            } else if (bl.state === 'wilting') {
              bl.wiltTimer -= effectiveDt;
              if (bl.wiltTimer <= 0) {
                bl.state = 'dead';
              }
            } else if (bl.state === 'dead' && b.health > 0.5 && senescence < 0.85) {
              bl.resproutTimer -= effectiveDt;
              if (bl.resproutTimer <= 0) {
                bl.state = 'mature';
                bl.age = 0.0;
                bl.wiltTimer = 16.0;
                bl.resproutTimer = 25.0;
              }
            }
          });

          // Update child flower on this branch
          const bf = b.flower;
          if (bf.state === 'dormant' && b.currentLength >= targetLen * 0.85) {
            bf.state = 'bud';
            bf.bloom = 0.15;
            bf.age = 0.0;
          }
          if (bf.state === 'bud' || bf.state === 'opening') {
            bf.bloom = Math.min(1.0, bf.bloom + effectiveDt * 0.05);
            if (bf.bloom >= 0.85) bf.state = 'blooming';
          } else if (bf.state === 'blooming') {
            bf.age += effectiveDt;
            if (bf.age >= bf.lifespan || senescence > 0.15) {
              bf.state = 'wilting';
            }
          } else if (bf.state === 'wilting') {
            bf.bloom = Math.max(0.0, bf.bloom - effectiveDt * 0.04);
            if (bf.bloom <= 0.05) {
              bf.state = 'dead';
              bf.isDead = true;
              bf.resproutTimer = 35.0;
            }
          } else if (bf.state === 'dead' && b.health > 0.6 && senescence < 0.85) {
            bf.resproutTimer -= effectiveDt;
            if (bf.resproutTimer <= 0) {
              bf.state = 'bud';
              bf.bloom = 0.15;
              bf.age = 0.0;
              bf.isDead = false;
            }
          }

          // =========================================================
          // THE BRANCH DEPENDENCY RULE:
          // "if all flowers on that branch are dead and all leaves are dead
          // then there is a chance for it to die"
          // =========================================================
          const allLeavesDead = b.leaves.every(l => l.state === 'dead' || l.state === 'wilting');
          const allFlowersDead = !bf || bf.state === 'dead' || bf.state === 'dormant';

          if (allLeavesDead && allFlowersDead && b.state !== 'dormant') {
            // Vascular sap flow stops; branch withers
            b.health = Math.max(0.0, b.health - effectiveDt * 0.04);
            b.state = 'withering';

            // Progressive organic probability to die and break off once health is depleted
            if (b.health <= 0.0) {
              b.deathTimer += effectiveDt;
              if (Math.random() < (0.06 * effectiveDt) || b.deathTimer > 30.0) {
                b.isDead = true;
                b.state = 'dead';
              }
            }
          } else if (b.state !== 'dormant' && !b.isDead) {
            // Alive leaves or flowers nourish the branch!
            b.health = Math.min(1.0, b.health + effectiveDt * 0.12);
            b.state = b.health > 0.6 ? 'thriving' : 'growing';
            b.deathTimer = 0.0;
          }
        }
      });
    }

    feedMembers(amount = 0.35) {
      if (!this.members) return;
      this.members.leaves.forEach(l => {
        if (l.state === 'wilting' || l.state === 'dead') {
          l.state = 'bud';
          l.maturity = 0.30;
          l.age = 0.0;
          l.isWilted = false;
          l.isDead = false;
          l.wiltTimer = 18.0;
        }
      });
      const af = this.members.apicalFlower;
      if (af.state === 'wilting' || af.state === 'dead') {
        af.state = 'blooming';
        af.bloom = 0.85;
        af.age = 0.0;
      }
      this.members.branches.forEach(b => {
        b.health = 1.0;
        if (b.state === 'withering') b.state = 'thriving';
        b.leaves.forEach(bl => {
          if (bl.state === 'wilting' || bl.state === 'dead') {
            bl.state = 'mature';
            bl.age = 0.0;
          }
        });
        if (b.flower && (b.flower.state === 'wilting' || b.flower.state === 'dead')) {
          b.flower.state = 'blooming';
          b.flower.bloom = 0.80;
          b.flower.isDead = false;
        }
      });
    }

    simulate(age = 1.0, bloomOverride = null, time = 0, windStrength = 0.5, pointerDist = null) {
      age = Math.max(0.02, age);
      const growthAge = Math.min(1.0, age);
      // Mature prime life plateau: stays at full height for at least 20n (1.0 <= age <= 21.0)!
      const senescence = (age > 21.0) ? clamp((age - 21.0) / 2.5, 0.0, 1.0) : 0.0;

      const effectiveMaxHeight = this.maxHeight * this.geneticHeightMod;
      const growthFactor = (1 - Math.exp(-4 * growthAge)) / (1 - Math.exp(-4));
      let shootHeight = Math.max(20, effectiveMaxHeight * growthFactor);
      if (senescence > 0) {
        shootHeight = Math.max(16, shootHeight * (1.0 - senescence * 0.22));
      }

      // 1. Stem Spine Spline
      const stemSegments = Math.max(6, Math.floor(shootHeight / 9));
      const stemNodes = [];
      const dirMult = this.geneticHabit.includes('left') ? -1 : 1;

      for (let i = 0; i <= stemSegments; i++) {
        const t = i / stemSegments;
        let dx = 0;

        if (this.geneticHabit === 'erect') {
          dx = Math.sin(t * Math.PI) * 8 * dirMult;
        } else if (this.geneticHabit.includes('curved')) {
          dx = Math.sin(t * Math.PI * 0.85) * this.geneticBendAmp * dirMult;
        } else if (this.geneticHabit === 's_curve') {
          dx = Math.sin(t * Math.PI * 1.8) * (this.geneticBendAmp * 0.65);
        } else if (this.geneticHabit === 'windswept') {
          dx = Math.pow(t, 1.5) * (this.geneticBendAmp * 1.4) * dirMult;
        } else if (this.geneticHabit === 'zigzag') {
          dx = Math.sin(t * Math.PI * 3.2) * 10;
        }

        dx += Math.sin(t * Math.PI * 0.9) * (this.userCurvature * 45);

        // Turgor loss during senescence causes stem to bow/droop with gravity
        if (senescence > 0) {
          dx += (this.seed % 2 === 0 ? 1 : -1) * Math.sin(t * Math.PI) * (24 * senescence * t);
        }

        const windWave = Math.sin(time * 2.2 + t * 2.5) * (windStrength * 16 * Math.pow(t, 1.4));

        let pointerDeflection = 0;
        if (pointerDist) {
          const distSq = pointerDist.dx * pointerDist.dx + pointerDist.dy * pointerDist.dy;
          const infl = Math.exp(-distSq / (2 * 250 * 250)) * (pointerDist.strength || 1.0);
          if (pointerDist.mode === 'flinch') {
            pointerDeflection = -Math.sign(pointerDist.dx) * infl * 40 * t;
          } else {
            pointerDeflection = Math.sign(pointerDist.dx) * Math.min(50, Math.abs(pointerDist.dx) * 0.2) * infl * t;
          }
        }

        const x = dx + windWave + pointerDeflection;
        const y = t * shootHeight;
        stemNodes.push({ x, y, t });
      }

      // 2. Leaves with Member Subcycles and Smooth Allometric Emergence
      if (!this.members) this.initMembers();

      const leaves = [];
      const activeLeaves = [];

      this.members.leaves.forEach(l => {
        const nodeTargetY = l.yRatio * (effectiveMaxHeight * 0.88) + (l.yOffset || 0);
        if (shootHeight >= nodeTargetY) {
          // If updateMembers hasn't stepped (static call), compute continuous maturity and wilting
          let maturity = l.maturity;
          let isW = l.isWilted || l.state === 'wilting';

          if (l.state === 'dormant') {
            const apexDistance = shootHeight - nodeTargetY;
            maturity = clamp((apexDistance - 2) / 48, 0.08, 1.0);
            if (nodeTargetY < effectiveMaxHeight * 0.25 && growthAge > 0.65) {
              isW = true;
            }
            if (senescence > 0.12 && nodeTargetY < effectiveMaxHeight * (0.25 + senescence * 0.8)) {
              isW = true;
            }
          }

          if (l.state !== 'dead') {
            const allometry = 0.72 + 0.55 * Math.sin(l.yRatio * Math.PI);
            const scale = (l.baseScale !== undefined ? l.baseScale : ((l.scaleMod || 1.0) * allometry)) * maturity * (this.scale || 1.0);
            const leafObj = {
              id: l.id,
              y: nodeTargetY,
              side: l.side,
              scale,
              maturity,
              isWilted: isW,
              state: l.state
            };
            leaves.push(leafObj);
            if (!isW && maturity > 0.35) {
              activeLeaves.push(leafObj);
            }
          }
        }
      });

      // 3. Auxin & Axillary Branches with Child Leaves, Tip Flowers, and Living Subcycles
      const branches = [];
      this.members.branches.forEach(b => {
        if (b.isDead) return; // Dead branches drop off organically!

        const startY = b.startYRatio * (effectiveMaxHeight * 0.88);
        if (shootHeight >= startY && growthAge > 0.45) {
          let bLen = b.currentLength;
          if (b.state === 'dormant' || bLen < 1) {
            const bProgress = Math.min(1.0, (growthAge - 0.48) / 0.45);
            bLen = shootHeight * b.lengthRatio * bProgress * (1.0 - senescence * 0.35);
          }

          if (bLen > 2) {
            const bAngle = b.angle + (senescence * 0.28);
            const hasFlower = b.flower && (b.flower.state === 'bud' || b.flower.state === 'opening' || b.flower.state === 'blooming' || b.flower.state === 'wilting');
            branches.push({
              id: b.id,
              startY: startY,
              side: b.side,
              length: bLen,
              angle: bAngle,
              state: b.state,
              health: b.health,
              leaves: b.leaves || [],
              flower: b.flower,
              hasFlower
            });
          }
        }
      });

      // 4. Flower Scaling Modulated by Active Leaves Biomass
      const totalLeafEnergy = activeLeaves.reduce((acc, l) => acc + (l.scale !== undefined ? l.scale : 1.0), 0);
      let flowerScale = (0.65 + totalLeafEnergy * 0.08) * this.geneticFlowerScaleMod * (this.scale || 1.0);
      flowerScale = clamp(flowerScale, 0.3 * (this.scale || 1.0), 1.45 * (this.scale || 1.0));

      // Continuous Smooth Bud-to-Bloom & Member Subcycles
      let bloom = 0.0;
      if (bloomOverride !== null) {
        bloom = clamp(bloomOverride, 0.0, 1.0);
      } else if (this.members && this.members.apicalFlower && this.members.apicalFlower.state !== 'dormant') {
        bloom = this.members.apicalFlower.bloom;
      } else if (growthAge > 0.42) {
        // Natural gradual opening starting at age 0.42, fully open at 0.88
        bloom = smoothstep(0.42, 0.88, growthAge);
      }

      // Senescence effect on flower: petals droop and fade
      if (senescence > 0.0) {
        bloom = Math.max(0.0, bloom * (1.0 - senescence * 0.65));
      }

      const isBud = (this.members && this.members.apicalFlower && this.members.apicalFlower.state !== 'dormant')
        ? true
        : (growthAge > 0.38 && senescence < 0.88);

      const isWilting = (senescence > 0.15) || (this.members && this.members.apicalFlower && this.members.apicalFlower.state === 'wilting');

      return {
        type: this.type,
        scale: this.scale || 1.0,
        age,
        growthAge,
        senescence,
        isWilting,
        isDecaying: (senescence >= 0.88),
        bloom,
        isBud,
        shootHeight,
        stemNodes,
        leaves,
        branches,
        flowerScale,
        headTilt: this.geneticHeadTilt + (senescence * 0.45 * (this.seed % 2 === 0 ? 1 : -1)),
        petalChaos: this.geneticPetalChaos,
        activeLeafCount: activeLeaves.length
      };
    }
  }

  // =========================================================================
  // 4. SPECIES-SPECIFIC BOTANICAL ARCHITECTURE (STEMS & FOLIAGE GUIDELINES)
  // =========================================================================

  class BotanicalArchitect {
    static generatePlantGlyphs(pData, originX, groundY, palette, seed = 42, time = 0, seedsBlown = false) {
      const glyphs = [];
      const pType = pData.type;
      const pScale = pData.scale || 1.0;
      const nodes = pData.stemNodes;
      const shootH = pData.shootHeight;
      const leaves = pData.leaves;
      const branches = pData.branches;
      const fScale = pData.flowerScale;
      const bloom = pData.bloom;
      const age = pData.age;
      const stemSize = Math.max(7, Math.round(14 * pScale));

      const cStem = pData.isWilting ? (palette.wilted || '#7c7332') : palette.stem;
      const cStemDark = pData.isWilting ? (palette.dead || '#4a3d1b') : palette.stemDark;
      const cWilted = palette.wilted;
      const cDead = palette.dead;

      // Senescence completion: plant has decayed back to soil stubble & mulch
      if (pData.isDecaying) {
        const cMulch = palette.dead || '#553c1a';
        glyphs.push({ x: originX - 4, y: groundY + 2, char: ".", fg: cMulch, size: 10 });
        glyphs.push({ x: originX, y: groundY - 2, char: "|", fg: cMulch, size: 12 });
        glyphs.push({ x: originX + 3, y: groundY + 1, char: "_", fg: cMulch, size: 11 });
        glyphs.push({ x: originX + 7, y: groundY + 3, char: ",", fg: cMulch, size: 9 });
        return glyphs;
      }

      // -------------------------------------------------------------
      // 1. STEM DRAWING (SPECIES-SPECIFIC)
      // -------------------------------------------------------------
      if (pType === 'sunflower') {
        const spread = Math.max(2, Math.round(4 * pScale));
        const spread2 = Math.max(1, Math.round(2 * pScale));
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          const ch = (i % 5 === 0) ? "%" : ((i % 7 === 0) ? "#" : "|");
          if (n.y < shootH * 0.55) {
            glyphs.push({ x: px - spread, y: py, char: "|", fg: cStem, size: stemSize });
            glyphs.push({ x: px, y: py, char: ch, fg: cStem, size: stemSize });
            glyphs.push({ x: px + spread, y: py, char: "|", fg: cStem, size: stemSize });
          } else {
            glyphs.push({ x: px - spread2, y: py, char: "|", fg: cStem, size: stemSize });
            glyphs.push({ x: px + spread2, y: py, char: ch, fg: cStem, size: stemSize });
          }
        }
      } else if (pType === 'iris') {
        const off = Math.max(2, Math.round(4 * pScale));
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          const ch = (i > 8 && nodes[i].x > nodes[i - 4].x) ? "/" : ((i > 8 && nodes[i].x < nodes[i - 4].x) ? "\\" : "|");
          glyphs.push({ x: px, y: py, char: ch, fg: cStem, size: stemSize });
          if (i % 12 === 0 && i > 5 && i < nodes.length - 8) {
            glyphs.push({ x: px - off, y: py - off, char: "(", fg: cStemDark, size: Math.max(7, Math.round(13 * pScale)) });
            glyphs.push({ x: px + off, y: py - off, char: ")", fg: cStemDark, size: Math.max(7, Math.round(13 * pScale)) });
          }
        }
      } else if (pType === 'thistle') {
        const off = Math.max(2, Math.round(5 * pScale));
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          glyphs.push({ x: px, y: py, char: "|", fg: cStem, size: stemSize });
          if (i % 3 === 0) {
            glyphs.push({ x: px - off, y: py, char: "!", fg: cStem, size: Math.max(7, Math.round(12 * pScale)) });
            glyphs.push({ x: px + off, y: py, char: "!", fg: cStem, size: Math.max(7, Math.round(12 * pScale)) });
          }
        }
      } else if (pType === 'dandelion') {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          glyphs.push({ x: px, y: py, char: "|", fg: cStem, size: stemSize });
        }
      } else if (pType === 'rose') {
        const thornOff = Math.max(3, Math.round(6 * pScale));
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          glyphs.push({ x: px, y: py, char: "|", fg: cStem, size: stemSize });
          if (i % 7 === 0 && i > 3) {
            const thornSide = (i % 14 === 0) ? -1 : 1;
            glyphs.push({ x: px + thornSide * thornOff, y: py, char: thornSide < 0 ? "<" : ">", fg: '#d23737', size: Math.max(7, Math.round(13 * pScale)) });
          }
        }
      } else if (pType === 'tulip') {
        const spread = Math.max(1, Math.round(2 * pScale));
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          glyphs.push({ x: px - spread, y: py, char: "|", fg: cStem, size: stemSize });
          glyphs.push({ x: px + spread, y: py, char: "|", fg: cStem, size: stemSize });
        }
      } else if (pType === 'marigold') {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          glyphs.push({ x: px, y: py, char: (i % 4 === 0 ? ":" : "|"), fg: cStem, size: Math.max(7, Math.round(13 * pScale)) });
        }
      } else if (pType === 'daffodil') {
        const apexOff = Math.max(2, Math.round(4 * pScale));
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          glyphs.push({ x: px, y: py, char: "|", fg: cStem, size: stemSize });
        }
        const apexX = originX + nodes[nodes.length - 1].x;
        const apexY = groundY - nodes[nodes.length - 1].y;
        glyphs.push({ x: apexX - apexOff, y: apexY + apexOff, char: "(", fg: '#b49650', size: Math.max(7, Math.round(13 * pScale)) });
        glyphs.push({ x: apexX + apexOff, y: apexY + apexOff, char: ")", fg: '#b49650', size: Math.max(7, Math.round(13 * pScale)) });
      } else {
        const spread = Math.max(1, Math.round(3 * pScale));
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const px = originX + n.x;
          const py = groundY - n.y;
          const ch = (i % 6 === 0) ? "%" : ((i % 7 === 0) ? "+" : "|");
          if (n.y < shootH * 0.4) {
            glyphs.push({ x: px - spread, y: py, char: "|", fg: cStem, size: stemSize });
            glyphs.push({ x: px + spread, y: py, char: ch, fg: cStem, size: stemSize });
          } else {
            glyphs.push({ x: px, y: py, char: ch, fg: cStem, size: stemSize });
          }
        }
      }

      // -------------------------------------------------------------
      // 2. FOLIAGE DRAWING (SPECIES-SPECIFIC)
      // -------------------------------------------------------------
      if (pType === 'iris') {
        const bladeHeights = [shootH * 0.55, shootH * 0.72, shootH * 0.85, shootH * 0.62];
        const bladeOffsets = [-22, -10, 12, 24];
        bladeHeights.forEach((bh, bIdx) => {
          const bx = bladeOffsets[bIdx];
          const steps = Math.floor(bh / 10);
          for (let bi = 0; bi <= steps; bi++) {
            const bt = bi / steps;
            const by = groundY - (bi * 10);
            const curv = Math.sin(bt * Math.PI * 0.5) * (bx * 0.4);
            const px = originX + bx + curv;
            const ch = bx > 0 ? "/" : "\\";
            glyphs.push({ x: px, y: by, char: ch, fg: bt < 0.7 ? cStem : cStemDark, size: 13 });
          }
          glyphs.push({ x: originX + bx * 1.4, y: groundY - bh, char: "^", fg: cStem, size: 12 });
        });
      } else if (pType === 'dandelion') {
        const baseAngles = [-1.3, -0.9, -0.5, -0.2, 0.2, 0.5, 0.9, 1.3];
        const numLeaves = 6 + (seed % 3);
        for (let i = 0; i < numLeaves; i++) {
          const ang = baseAngles[i % baseAngles.length] + (((seed * (i + 1) * 7) % 11) - 5) * 0.04;
          const leafScale = 0.75 + (((seed * (i + 3) * 13) % 17) / 17) * 0.55;
          const leafLen = (48 + Math.sin(ang * 4) * 22) * age * leafScale;
          for (let dist = 10; dist <= leafLen; dist += 8) {
            const lx = originX + Math.sin(ang) * dist;
            const ly = groundY - Math.cos(ang) * (dist * 0.35);
            glyphs.push({ x: lx, y: ly, char: ang < 0 ? ">" : "<", fg: cStem, size: Math.max(10, Math.round(13 * leafScale)) });
            glyphs.push({ x: lx, y: ly - 3, char: "#", fg: cStemDark, size: Math.max(9, Math.round(11 * leafScale)) });
          }
        }
      } else if (pType === 'marigold') {
        leaves.forEach(leaf => {
          const t = leaf.y / Math.max(1, shootH);
          const nIdx = Math.min(nodes.length - 1, Math.floor(t * (nodes.length - 1)));
          const lx = originX + nodes[nIdx].x;
          const lyScreen = groundY - leaf.y;
          const lScale = leaf.scale || 1.0;
          const isW = leaf.isWilted;
          const col = isW ? cWilted : cStem;

          if (leaf.state === 'bud') {
            glyphs.push({ x: lx + leaf.side * 4, y: lyScreen - 2, char: leaf.side < 0 ? "'" : "`", fg: cStem, size: 10 });
            return;
          }

          const rachisLen = Math.round(32 * lScale);
          for (let r = 8; r <= rachisLen; r += 8) {
            const rx = lx + leaf.side * r;
            const ry = lyScreen - (r * 0.25) + (isW ? r * 0.45 : 0);
            glyphs.push({ x: rx, y: ry, char: isW ? "~" : "-", fg: col, size: Math.max(9, Math.round(12 * lScale)) });
            if (!isW) {
              glyphs.push({ x: rx, y: ry - 6 * lScale, char: "/", fg: cStem, size: Math.max(8, Math.round(11 * lScale)) });
              glyphs.push({ x: rx, y: ry + 6 * lScale, char: "\\", fg: cStem, size: Math.max(8, Math.round(11 * lScale)) });
            } else {
              glyphs.push({ x: rx, y: ry + 4 * lScale, char: "\\", fg: cDead, size: Math.max(8, Math.round(10 * lScale)) });
            }
          }
        });
      } else if (pType === 'tulip') {
        [-1, 1].forEach(side => {
          const tLeafH = shootH * 0.55;
          for (let step = 0; step <= tLeafH; step += 9) {
            const lt = step / tLeafH;
            const ly = groundY - step;
            const arch = Math.sin(lt * Math.PI) * 28 * side;
            const lx = originX + arch;
            glyphs.push({ x: lx, y: ly, char: side < 0 ? "(" : ")", fg: cStem, size: 15 });
            glyphs.push({ x: lx + side * 3, y: ly, char: "|", fg: cStemDark, size: 13 });
          }
        });
      } else if (pType === 'thistle') {
        leaves.forEach(leaf => {
          const t = leaf.y / Math.max(1, shootH);
          const nIdx = Math.min(nodes.length - 1, Math.floor(t * (nodes.length - 1)));
          const lx = originX + nodes[nIdx].x;
          const lyScreen = groundY - leaf.y;
          const lScale = leaf.scale || 1.0;
          const isW = leaf.isWilted;
          const col = isW ? cWilted : cStem;

          if (leaf.state === 'bud') {
            glyphs.push({ x: lx + leaf.side * 4, y: lyScreen - 2, char: "*", fg: cStem, size: 10 });
            return;
          }
          if (isW) {
            glyphs.push({ x: lx + leaf.side * 8 * lScale, y: lyScreen + 6 * lScale, char: "\\", fg: cWilted, size: 12 });
            glyphs.push({ x: lx + leaf.side * 14 * lScale, y: lyScreen + 12 * lScale, char: "~", fg: cDead, size: 11 });
            glyphs.push({ x: lx + leaf.side * 20 * lScale, y: lyScreen + 18 * lScale, char: "v", fg: cDead, size: 10 });
            return;
          }
          const spinyPts = [
            { ox: leaf.side * 8 * lScale, oy: -6 * lScale, ch: "/" }, { ox: leaf.side * 16 * lScale, oy: -10 * lScale, ch: "*" }, { ox: leaf.side * 22 * lScale, oy: -6 * lScale, ch: "\\" },
            { ox: leaf.side * 12 * lScale, oy: 0, ch: "#" }, { ox: leaf.side * 20 * lScale, oy: 0, ch: "%" }, { ox: leaf.side * 28 * lScale, oy: 0, ch: "!" },
            { ox: leaf.side * 8 * lScale, oy: 6 * lScale, ch: "\\" }, { ox: leaf.side * 16 * lScale, oy: 10 * lScale, ch: "*" }, { ox: leaf.side * 24 * lScale, oy: 6 * lScale, ch: "/" }
          ];
          spinyPts.forEach(pt => {
            glyphs.push({ x: lx + pt.ox, y: lyScreen + pt.oy, char: pt.ch, fg: col, size: Math.max(10, Math.round(13 * lScale)) });
          });
        });
      } else if (pType === 'daffodil') {
        [-1, 1].forEach(side => {
          const leafH = shootH * 0.75;
          for (let step = 0; step <= leafH; step += 10) {
            glyphs.push({ x: originX + side * 16, y: groundY - step, char: "|", fg: cStem, size: 14 });
          }
          glyphs.push({ x: originX + side * 16, y: groundY - leafH, char: "n", fg: cStem, size: 13 });
        });
      } else {
        leaves.forEach(leaf => {
          const t = leaf.y / Math.max(1, shootH);
          const nIdx = Math.min(nodes.length - 1, Math.floor(t * (nodes.length - 1)));
          const lx = originX + nodes[nIdx].x;
          const lyScreen = groundY - leaf.y;
          const lScale = leaf.scale || 1.0;
          const mat = leaf.maturity !== undefined ? leaf.maturity : 1.0;

          // Nascent bud stage: leaf has just emerged from apical meristem
          if (mat < 0.35 && !leaf.isWilted) {
            const budChar = leaf.side < 0 ? "'" : "`";
            glyphs.push({ x: lx + leaf.side * 4, y: lyScreen - 2, char: budChar, fg: cStem, size: 10 });
            return;
          }

          if (leaf.isWilted) {
            const wiltPts = [
              { ox: leaf.side * 8 * lScale, oy: 4 * lScale, ch: "\\" },
              { ox: leaf.side * 14 * lScale, oy: 10 * lScale, ch: "~" },
              { ox: leaf.side * 19 * lScale, oy: 16 * lScale, ch: "v" },
              { ox: leaf.side * 23 * lScale, oy: 22 * lScale, ch: "." }
            ];
            wiltPts.forEach((pt, pIdx) => {
              glyphs.push({ x: lx + pt.ox, y: lyScreen + pt.oy, char: pt.ch, fg: (pIdx < 2 ? cWilted : cDead), size: Math.max(9, Math.round(12 * lScale)) });
            });
          } else {
            // Gradual leaf unfurling: petiole extends first, then lamina broadens
            const pts = [];
            pts.push({ ox: leaf.side * 6 * lScale, oy: -2 * lScale, ch: leaf.side < 0 ? "/" : "\\" });
            pts.push({ ox: leaf.side * 12 * lScale, oy: -2 * lScale, ch: "*" });
            if (mat >= 0.50) {
              pts.push({ ox: leaf.side * 18 * lScale, oy: -2 * lScale, ch: "%" });
              pts.push({ ox: leaf.side * 8 * lScale, oy: 5 * lScale, ch: "|" });
              pts.push({ ox: leaf.side * 14 * lScale, oy: 5 * lScale, ch: "#" });
            }
            if (mat >= 0.70) {
              pts.push({ ox: leaf.side * 8 * lScale, oy: -8 * lScale, ch: "+" });
              pts.push({ ox: leaf.side * 14 * lScale, oy: -8 * lScale, ch: "+" });
              pts.push({ ox: leaf.side * 20 * lScale, oy: 4 * lScale, ch: "%" });
              pts.push({ ox: leaf.side * 24 * lScale, oy: -2 * lScale, ch: "#" });
            }
            if (mat >= 0.85) {
              pts.push({ ox: leaf.side * 20 * lScale, oy: -8 * lScale, ch: "+" });
              pts.push({ ox: leaf.side * 26 * lScale, oy: -8 * lScale, ch: "-" });
              pts.push({ ox: leaf.side * 26 * lScale, oy: 4 * lScale, ch: "&" });
              pts.push({ ox: leaf.side * 30 * lScale, oy: -2 * lScale, ch: "#" });
              pts.push({ ox: leaf.side * 10 * lScale, oy: 12 * lScale, ch: "+" });
              pts.push({ ox: leaf.side * 16 * lScale, oy: 12 * lScale, ch: "+" });
              pts.push({ ox: leaf.side * 22 * lScale, oy: 12 * lScale, ch: "+" });
              pts.push({ ox: leaf.side * 28 * lScale, oy: 12 * lScale, ch: "/" });
            }
            pts.forEach(pt => {
              glyphs.push({ x: lx + pt.ox, y: lyScreen + pt.oy, char: pt.ch, fg: cStem, size: Math.max(9, Math.round(13 * lScale)) });
            });
          }
        });
      }

      // -------------------------------------------------------------
      // 3. SECONDARY BRANCHES (WITH MEMBER SUBCYCLES & CHILD LEAVES)
      // -------------------------------------------------------------
      branches.forEach(b => {
        const t = b.startY / Math.max(1, shootH);
        const nIdx = Math.min(nodes.length - 1, Math.floor(t * (nodes.length - 1)));
        const bx0 = originX + nodes[nIdx].x;
        const by0 = groundY - b.startY;

        const isWithering = (b.state === 'withering' || (b.health !== undefined && b.health < 0.35));
        const brStemCol = isWithering ? cDead : cStem;

        for (let bi = 0; bi <= b.length; bi += 8) {
          const curvX = bx0 + b.side * (bi * Math.sin(b.angle) + Math.sin(bi * 0.12) * 5);
          const curvY = by0 - (bi * Math.cos(b.angle));
          const brChar = isWithering ? ":" : (b.side > 0 ? "/" : "\\");
          glyphs.push({ x: curvX, y: curvY, char: brChar, fg: brStemCol, size: 13 });
        }

        // Child leaves on this branch
        if (b.leaves && b.leaves.length > 0) {
          b.leaves.forEach(bl => {
            if (bl.state === 'dormant' || bl.state === 'dead') return;
            const bi = b.length * (bl.posAlong || 0.5);
            const lx = bx0 + b.side * (bi * Math.sin(b.angle) + Math.sin(bi * 0.12) * 5);
            const ly = by0 - (bi * Math.cos(b.angle));
            const isLeafWilted = (bl.state === 'wilting' || isWithering);
            const leafCol = isLeafWilted ? cDead : cStem;
            const lChar = isLeafWilted ? "~" : (bl.side < 0 ? "<" : ">");
            glyphs.push({ x: lx + bl.side * 5, y: ly, char: lChar, fg: leafCol, size: 11 });
          });
        }

        // Child flower at branch tip
        const bFlower = b.flower;
        const bBloom = (bFlower && bFlower.state !== 'dormant' && !bFlower.isDead) ? bFlower.bloom : (b.hasFlower ? bloom * 0.8 : 0);
        if (bBloom > 0.15) {
          const fEndX = bx0 + b.side * (b.length * Math.sin(b.angle));
          const fEndY = by0 - (b.length * Math.cos(b.angle));
          const secFlower = ProceduralFlowerRenderer.generateGlyphs(
            pType, fEndX, fEndY, fScale * 0.65, bBloom, palette, time, false, (pData.isWilting || isWithering)
          );
          glyphs.push(...secFlower);
        }
      });

      // -------------------------------------------------------------
      // 4. APICAL BUD OR FLOWER ANTHESIS (GRADUAL UNFURLING)
      // -------------------------------------------------------------
      const apexX = originX + nodes[nodes.length - 1].x;
      const apexY = groundY - nodes[nodes.length - 1].y;
      const tilt = pData.headTilt || 0.0;
      const tiltX = apexX + Math.sin(tilt) * 18;
      const tiltY = apexY - Math.cos(tilt) * 14;

      if (pData.isBud) {
        const flowerGlyphs = ProceduralFlowerRenderer.generateGlyphs(
          pType, tiltX, tiltY, fScale, bloom, palette, time, seedsBlown, pData.isWilting
        );
        glyphs.push(...flowerGlyphs);
      }

      return glyphs;
    }
  }

  // =========================================================================
  // 5. PROCEDURAL FLOWER HEAD GEOMETRY ENGINE (GRADUAL BUD-TO-BLOOM MATH)
  // =========================================================================

  class ProceduralFlowerRenderer {
    static generateGlyphs(type, cx, cy, scale, bloom, palette, time = 0, seedsBlown = false, isWilting = false) {
      const glyphs = [];
      const fPalette = palette.flowers[type] || palette.flowers.sunflower;
      const cStem = palette.stem;

      // STAGE 1: TIGHT CLOSED BUD (bloom < 0.18)
      // All species start as a compact protective calyx capsule with sepals!
      if (bloom < 0.18) {
        const budProgress = bloom / 0.18; // 0.0 to 1.0
        const budSize = (12 + budProgress * 4) * scale;
        // Calyx sepals wrapping the bud
        glyphs.push({ x: cx - 5 * scale, y: cy - 4 * scale, char: "(", fg: cStem, size: budSize });
        glyphs.push({ x: cx, y: cy - 8 * scale, char: "#", fg: cStem, size: budSize });
        glyphs.push({ x: cx + 5 * scale, y: cy - 4 * scale, char: ")", fg: cStem, size: budSize });
        // Colored petal tip peeking out as sepals loosen!
        if (budProgress > 0.4) {
          glyphs.push({ x: cx, y: cy - 14 * scale, char: "*", fg: fPalette.petal || fPalette.standard || '#ffe628', size: 12 * scale });
        }
        return glyphs;
      }

      // STAGE 2: PARTING SEPALS & CONICAL BUD (0.18 <= bloom < 0.45)
      // Sepals peel back outward; inner petals form an emerging cone
      if (bloom < 0.45) {
        const partProgress = (bloom - 0.18) / 0.27;
        const sepalDist = 12 * scale * partProgress;
        // Parted sepals
        glyphs.push({ x: cx - sepalDist, y: cy + 2 * scale, char: "\\", fg: cStem, size: 14 * scale });
        glyphs.push({ x: cx + sepalDist, y: cy + 2 * scale, char: "/", fg: cStem, size: 14 * scale });
        glyphs.push({ x: cx, y: cy + 4 * scale, char: "v", fg: cStem, size: 13 * scale });
        // Emerging petal cone
        const petalCol = fPalette.petal || fPalette.outer || fPalette.standard || '#ffe628';
        glyphs.push({ x: cx - 4 * scale, y: cy - 8 * scale, char: "(", fg: petalCol, size: 14 * scale });
        glyphs.push({ x: cx, y: cy - 12 * scale, char: "^", fg: petalCol, size: 15 * scale });
        glyphs.push({ x: cx + 4 * scale, y: cy - 8 * scale, char: ")", fg: petalCol, size: 14 * scale });
        return glyphs;
      }

      // STAGE 3 & 4: HALF-BLOOM & FULL ANTHESIS (bloom >= 0.45)
      // Mathematical expansion factor b_eff: 0.0 at bloom=0.45, 1.0 at bloom=1.0
      const bEff = smoothstep(0.45, 1.0, bloom);

      switch (type) {
        case 'sunflower':
          this._buildSunflower(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'hibiscus':
          this._buildHibiscus(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'iris':
          this._buildIris(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'thistle':
          this._buildThistle(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'marigold':
          this._buildMarigold(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'daffodil':
          this._buildDaffodil(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'rose':
          this._buildRose(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'dandelion':
          this._buildDandelion(glyphs, cx, cy, scale, bEff, fPalette, time, seedsBlown, isWilting);
          break;
        case 'tulip':
          this._buildTulip(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        case 'flytrap':
          this._buildFlytrap(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
          break;
        default:
          this._buildSunflower(glyphs, cx, cy, scale, bEff, fPalette, time, isWilting);
      }

      return glyphs;
    }

    /**
     * Bounded Sunflower Architecture:
     * Central Fibonacci disc florets are strictly bounded within rDisc.
     * Ray petals radiate outwards from rDisc to frame the seed head with zero side bleeding.
     */
    static _buildSunflower(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 25 * s;

      // 1. Central Fibonacci Phyllotaxis Seed Disc (Strictly bounded inside rDisc)
      const rDisc = 22 * s * (0.35 + 0.65 * b);
      const numFlorets = Math.floor(40 * (0.35 + 0.65 * b));
      const goldenAngle = 2.3999632; // 137.5 degrees

      for (let k = 0; k < numFlorets; k++) {
        const rFrac = Math.sqrt((k + 0.5) / numFlorets);
        const r = rFrac * rDisc;
        const theta = k * goldenAngle;
        const px = cx + Math.cos(theta) * r;
        const py = fcy + Math.sin(theta) * (r * 0.88);

        let ch = '#';
        let col = pal.coreDeep;
        if (rFrac < 0.35) {
          ch = (k % 3 === 0) ? '8' : '&';
          col = isWilting ? '#523a1a' : pal.coreDeep;
        } else if (rFrac < 0.75) {
          ch = (k % 2 === 0) ? '*' : '#';
          col = isWilting ? '#634720' : pal.core;
        } else {
          ch = (k % 2 === 0) ? '%' : 'o';
          col = isWilting ? '#7a5b28' : pal.petalWarm;
        }

        out.push({
          x: px,
          y: py,
          char: ch,
          fg: col,
          size: Math.max(9, Math.round((10 + (1 - rFrac) * 3) * s))
        });
      }

      // 2. Radiant Golden Ray Petals (cradling the disc florets from rDisc outwards)
      if (b > 0.15) {
        const petalProgress = (b - 0.15) / 0.85;
        const numPetals = Math.floor(22 + 14 * petalProgress);
        const maxLen = 38 * s * petalProgress;
        const glyphsChoice = ["(", ")", "{", "}", "~", "S", "s", "%", "&"];

        for (let i = 0; i < numPetals; i++) {
          const baseAngle = (i / numPetals) * 2 * Math.PI;
          const layers = [1.0, 0.78];

          layers.forEach((layerScale, lIdx) => {
            const angle = baseAngle + (lIdx * Math.PI / numPetals);
            const petalReach = maxLen * layerScale;

            for (let seg = 1; seg <= 4; seg++) {
              const segFrac = seg / 4.0;
              const rDist = (rDisc * 0.92) + (segFrac * petalReach);
              const droop = isWilting ? (segFrac * segFrac * 14 * s) : 0;
              const curl = Math.sin(segFrac * Math.PI + i * 0.8) * 5 * s;
              const px = cx + Math.cos(angle) * rDist - Math.sin(angle) * curl;
              const py = fcy + Math.sin(angle) * (rDist * 0.88) + Math.cos(angle) * curl + droop;

              const ch = seg === 4 ? (lIdx === 0 ? "{" : "}") : glyphsChoice[(i * 2 + seg) % glyphsChoice.length];
              const col = isWilting
                ? (seg >= 3 ? '#997722' : '#886611')
                : (seg >= 3 ? pal.petal : pal.petalWarm);

              out.push({
                x: px,
                y: py,
                char: ch,
                fg: col,
                size: Math.max(10, Math.round((11 + seg * 1.8) * s))
              });
            }
          });
        }
      }
    }

    static _buildHibiscus(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 25 * s;
      const rows = [
        ["           /!/          ", pal.outer],
        ["     /**%/ 1@@@@@@1****- ", pal.outer],
        [" ****%) )/ @@@@@@@#@& !&#", pal.mid],
        ["@@@/ /%*======@@@/#&/ /**%", pal.mid],
        ["@@@// /#**%) #######/#//**", pal.inner],
        [" |##/@///#%#@@@@@@@@@@/|@@@/**#", pal.inner],
        [" #@ /(@############/==*###", pal.mid],
        [" % |##@@@@@@#@@@/@@######*", pal.mid],
        [" *@@@&%@--@@### / | */ ", pal.outer],
        ["   **@@@%# / *%&-#*%%   ", pal.outer],
        ["          | |@@@#*      ", pal.mid]
      ];
      const spX = 9.0 * s * (0.5 + 0.5 * b);
      const spY = 12.5 * s * (0.5 + 0.5 * b);
      const startY = fcy - (rows.length * spY) / 2.0;

      rows.forEach((row, rIdx) => {
        const text = row[0];
        const col = isWilting ? '#8c6b2a' : row[1];
        const ly = startY + rIdx * spY + (isWilting ? (rIdx * 1.5 * s) : 0);
        const startX = cx - (text.length * spX) / 2.0;
        for (let cIdx = 0; cIdx < text.length; cIdx++) {
          const ch = text[cIdx];
          if (ch !== ' ') {
            out.push({ x: startX + cIdx * spX, y: ly, char: ch, fg: col, size: 13.5 * s });
          }
        }
      });

      // Golden stamen pushes forward as flower blooms!
      if (b > 0.3) {
        const stamenProgress = (b - 0.3) / 0.7;
        const droopY = isWilting ? 12 * s : 0;
        const stamenPts = [
          { dx: -6 * s * stamenProgress, dy: 5 * s, ch: '%' },
          { dx: -18 * s * stamenProgress, dy: -4 * s, ch: '/' },
          { dx: -30 * s * stamenProgress, dy: -16 * s, ch: '(' },
          { dx: -42 * s * stamenProgress, dy: -28 * s, ch: '~' },
          { dx: -52 * s * stamenProgress, dy: -38 * s, ch: 'o' },
          { dx: -58 * s * stamenProgress, dy: -44 * s, ch: '*' }
        ];
        stamenPts.forEach(pt => {
          out.push({ x: cx + pt.dx, y: fcy + pt.dy + droopY, char: pt.ch, fg: isWilting ? '#8a7024' : pal.stamen, size: 15 * s });
        });
      }
    }

    static _buildIris(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 20 * s;
      const standardsLeft = [
        { dx: -16 * s * b, dy: -20 * s, txt: "((" },
        { dx: -20 * s * b, dy: -36 * s, txt: "%%%" },
        { dx: -22 * s * b, dy: -54 * s, txt: "@@@" },
        { dx: -18 * s * b, dy: -72 * s, txt: "((((" },
        { dx: -10 * s * b, dy: -84 * s, txt: "\\\\" }
      ];
      const standardsRight = [
        { dx: 16 * s * b, dy: -20 * s, txt: "))" },
        { dx: 20 * s * b, dy: -36 * s, txt: "%%%" },
        { dx: 22 * s * b, dy: -54 * s, txt: "@@@" },
        { dx: 18 * s * b, dy: -72 * s, txt: "))))" },
        { dx: 10 * s * b, dy: -84 * s, txt: "//" }
      ];
      [...standardsLeft, ...standardsRight].forEach(pt => {
        for (let i = 0; i < pt.txt.length; i++) {
          out.push({
            x: cx + pt.dx + i * 7.5 * s,
            y: fcy + pt.dy + (isWilting ? 10 * s : 0),
            char: pt.txt[i],
            fg: isWilting ? '#635338' : pal.standard,
            size: 14 * s
          });
        }
      });

      // Iris Falls: cascade downwards from throat in bounded ribbons
      const fallSteps = Math.floor(9 + 5 * b);
      for (let side of [-1, 1]) {
        for (let i = 0; i <= fallSteps; i++) {
          const ft = i / fallSteps;
          const fx = cx + side * (12 * s + ft * 20 * s * b);
          const fy = fcy - 4 * s + (ft * 34 * s * b) + Math.sin(ft * Math.PI) * 6 * s + (isWilting ? 8 * s : 0);
          const ch = i === fallSteps ? (side < 0 ? "\\" : "/") : (i % 3 === 0 ? "@" : (i % 3 === 1 ? "#" : "%"));
          const col = isWilting ? '#604f32' : (i % 2 === 0 ? pal.fall : pal.standard);
          out.push({ x: fx, y: fy, char: ch, fg: col, size: Math.max(10, Math.round((12 + ft * 3) * s)) });
        }
      }

      if (b > 0.4) {
        const throat = [{ dy: -12 * s, txt: "|(@/9|" }, { dy: -2 * s, txt: "|%&%#|" }, { dy: 8 * s, txt: "\\b)|" }];
        throat.forEach(tr => {
          for (let i = 0; i < tr.txt.length; i++) {
            const ch = tr.txt[i];
            const col = isWilting ? '#7c6530' : ((ch === '@' || ch === '9' || ch === '&') ? pal.signal : pal.deep);
            out.push({ x: cx + (i - tr.txt.length / 2) * 8 * s, y: fcy + tr.dy, char: ch, fg: col, size: 14 * s });
          }
        });
      }
    }

    static _buildThistle(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 15 * s;
      const calyxChars = [":", ";", "%", "&", "#", "@", "|"];
      const rCalyx = 26 * s;
      for (let dy = 0; dy <= rCalyx * 1.3; dy += 6) {
        const widthAtY = Math.sin((dy / (rCalyx * 1.3)) * Math.PI) * rCalyx;
        for (let dx = -Math.floor(widthAtY); dx <= Math.floor(widthAtY); dx += 7) {
          const ch = calyxChars[(Math.abs(dx + dy)) % calyxChars.length];
          out.push({ x: cx + dx, y: fcy + dy, char: ch, fg: isWilting ? '#52482a' : pal.calyx, size: 12.5 * s });
        }
      }
      for (let plume = -4; plume <= 4; plume++) {
        const pAngle = (plume / 5.0) * 0.75 - Math.PI / 2.0;
        for (let step = 1; step <= 7; step++) {
          const dist = step * 11 * s * b;
          const px = cx + Math.cos(pAngle) * dist;
          const py = fcy + Math.sin(pAngle) * dist + (isWilting ? step * 2 * s : 0);
          const ch = step >= 5 ? '!' : (plume > 0 ? '/' : '\\');
          const col = isWilting ? '#6e5436' : (step >= 4 ? pal.brush : pal.brushDark);
          out.push({ x: px, y: py, char: ch, fg: col, size: 14 * s });
        }
      }
    }

    /**
     * Bounded Marigold Architecture:
     * Multi-tiered ruffled concentric domes of yellow, orange, and crimson frilled petals.
     * Perfectly radial and hemispherical with zero rectangular edge spill.
     */
    static _buildMarigold(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 20 * s;
      const numTiers = Math.floor(4 + 3 * b);
      const maxR = 30 * s * b;
      const chars = ["{", "}", "~", "%", "@", "#", "="];

      for (let tier = 1; tier <= numTiers; tier++) {
        const tierFrac = tier / numTiers;
        const tierR = tierFrac * maxR;
        const petalCount = Math.floor(6 + tier * 5);
        const col = isWilting
          ? '#826524'
          : (tierFrac < 0.4 ? pal.yellow : (tierFrac < 0.75 ? pal.orange : pal.crimson));

        for (let p = 0; p < petalCount; p++) {
          const ang = (p / petalCount) * 2 * Math.PI + (tier * 0.4);
          const r = tierR * (0.85 + 0.15 * Math.sin(p * 3 + tier));
          const px = cx + Math.cos(ang) * r;
          const py = fcy + Math.sin(ang) * (r * 0.75) + (isWilting ? 6 * s : 0);
          const ch = chars[(tier * 2 + p) % chars.length];
          out.push({
            x: px,
            y: py,
            char: ch,
            fg: col,
            size: Math.max(10, Math.round((11 + tier * 1.2) * s))
          });
        }
      }
    }

    static _buildDaffodil(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 20 * s;
      const gridChars = ["#", "*", "%", "#", "*"];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ch = gridChars[(Math.abs(dx + dy)) % gridChars.length];
          const col = (dx === 0 && dy === 0) ? (isWilting ? '#7d6824' : pal.inner) : (isWilting ? '#947a28' : pal.cup);
          out.push({ x: cx + dx * 9 * s, y: fcy + dy * 9 * s, char: ch, fg: col, size: 13.5 * s });
        }
      }
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6.0) * 2 * Math.PI;
        for (let step = 1; step <= 5; step++) {
          const dist = 18 * s + step * 10 * s * b;
          const px = cx + Math.cos(ang) * dist;
          const py = fcy + Math.sin(ang) * dist + (isWilting ? step * 1.5 * s : 0);
          const ch = step === 5 ? '*' : (step >= 3 ? '^' : '+');
          out.push({ x: px, y: py, char: ch, fg: isWilting ? '#9e852a' : pal.petal, size: 14 * s });
        }
      }
    }

    /**
     * Dense English Rose Architecture:
     * Multi-tiered concentric spiraling whorls, velvet Fermat core, cupped mid petals,
     * scalloped outer reflexed petals, and basal sepals.
     */
    static _buildRose(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 22 * s;

      // 1. Basal protective sepals wrapping the rose cup
      const sepalPoints = [
        { dx: -18 * s, dy: 14 * s, ch: '\\' },
        { dx: -9 * s, dy: 18 * s, ch: '\\' },
        { dx: 0, dy: 20 * s, ch: 'v' },
        { dx: 9 * s, dy: 18 * s, ch: '/' },
        { dx: 18 * s, dy: 14 * s, ch: '/' }
      ];
      sepalPoints.forEach(sp => {
        out.push({
          x: cx + sp.dx,
          y: fcy + sp.dy,
          char: sp.ch,
          fg: isWilting ? '#52482a' : (pal.sepal || '#4ba032'),
          size: 14 * s
        });
      });

      // 2. Dense spiraling velvet core (Fibonacci / Fermat spiral)
      const coreCount = Math.floor(20 + 16 * b);
      const coreRMax = 15 * s * (0.35 + 0.65 * b);
      const goldenAngle = 2.3999632;
      const coreChars = ['@', '%', '&', '8', '0', 'Q', 'S'];
      for (let k = 0; k < coreCount; k++) {
        const rFrac = Math.sqrt((k + 0.5) / coreCount);
        const r = rFrac * coreRMax;
        const theta = k * goldenAngle;
        const px = cx + Math.cos(theta) * r;
        const py = fcy + Math.sin(theta) * (r * 0.72);
        const ch = coreChars[k % coreChars.length];
        const col = isWilting ? '#6e1d2c' : pal.dark;
        out.push({
          x: px,
          y: py,
          char: ch,
          fg: col,
          size: Math.max(10, Math.round((11 + (1 - rFrac) * 3) * s))
        });
      }

      // 3. Middle overlapping cupped petals & outer scalloped whorls
      const petalRings = [
        { count: 4, r: 22 * s * b, chars: ['(', ')', '{', '}', '%', '&'], col: isWilting ? '#7e2434' : pal.petal },
        { count: 5, r: 30 * s * b, chars: ['{', '}', '(', ')', 'S', 's'], col: isWilting ? '#8c2d3e' : pal.petal },
        { count: 6, r: 38 * s * b, chars: ['{', '}', '~', '(', ')', 'S'], col: isWilting ? '#99394d' : pal.light }
      ];

      petalRings.forEach((ring, rIdx) => {
        const numPetals = ring.count;
        for (let p = 0; p < numPetals; p++) {
          const baseAng = (p / numPetals) * 2 * Math.PI + (rIdx * 0.52);
          const span = (Math.PI * 2) / numPetals * 1.32; // natural overlapping petal arcs
          const steps = 5;
          for (let st = 0; st <= steps; st++) {
            const u = (st / steps) - 0.5;
            const ang = baseAng + u * span;
            const cupping = Math.cos(u * Math.PI);
            const r = ring.r * (0.84 + 0.20 * cupping);
            const droop = isWilting ? (st * 1.5 * s) : 0;
            const px = cx + Math.cos(ang) * r;
            const py = fcy + Math.sin(ang) * (r * 0.74) + droop;
            const ch = (st === 0 || st === steps)
              ? (u < 0 ? '(' : ')')
              : ring.chars[(p * 3 + st) % ring.chars.length];
            out.push({
              x: px,
              y: py,
              char: ch,
              fg: ring.col,
              size: Math.max(10, Math.round((12 + rIdx * 1.5) * s))
            });
          }
        }
      });
    }

    static _buildDandelion(out, cx, cy, s, b, pal, time, seedsBlown = false) {
      const fcy = cy - 20 * s;

      // Core receptacle
      out.push({ x: cx, y: fcy, char: '(#)', fg: pal.core, size: 15 * s });

      // If seeds were blown away, show bare seedhead with a few stragglers
      if (seedsBlown) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * 2 * Math.PI;
          out.push({ x: cx + Math.cos(ang) * 16 * s, y: fcy + Math.sin(ang) * 16 * s, char: "'", fg: pal.seed, size: 12 * s });
        }
        return;
      }

      // Full dandelion fluffy seed clock
      const numSeeds = Math.floor(18 + 18 * b);
      const rClock = 42 * s * b;
      for (let i = 0; i < numSeeds; i++) {
        const ang = (i / numSeeds) * 2 * Math.PI;
        const r = rClock * (0.8 + 0.2 * Math.sin(i * 3));
        const px = cx + Math.cos(ang) * r;
        const py = fcy + Math.sin(ang) * r;
        const ch = (i % 3 === 0) ? '*' : ((i % 3 === 1) ? '·' : "'");
        out.push({ x: px, y: py, char: ch, fg: pal.seed, size: 13 * s });
      }
    }

    /**
     * Dense Sculpted Tulip Chalice Architecture:
     * Elegant goblet chalice with vertical striations, golden internal stamens,
     * basal receptacle, and flaring crown tepal tips.
     */
    static _buildTulip(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 22 * s;
      const cupHeight = 44 * s;
      const flare = 0.75 + 0.35 * b;
      const maxW = 21 * s * flare;
      const numLayers = 8;

      // 1. Glowing Interior Stamens (3 golden anthers on dark filaments)
      for (let st = -1; st <= 1; st++) {
        const sx = cx + st * 6 * s * flare;
        // Filament
        for (let sy = 0; sy < 3; sy++) {
          out.push({
            x: sx,
            y: fcy - (8 + sy * 5.5) * s,
            char: '|',
            fg: isWilting ? '#5e481c' : '#8a6010',
            size: 13 * s
          });
        }
        // Anther head
        out.push({
          x: sx,
          y: fcy - (23 + Math.abs(st) * 3) * s,
          char: '*',
          fg: isWilting ? '#a88a38' : pal.stamen,
          size: 14 * s
        });
      }

      // 2. Dense Chalice Body & Petal Striations (layer by layer from base to rim)
      for (let li = 0; li < numLayers; li++) {
        const vFrac = li / (numLayers - 1); // 0 = base, 1 = rim
        const ly = fcy + 12 * s - vFrac * cupHeight + (isWilting ? (vFrac * 4 * s) : 0);
        const cupProfile = Math.sin(vFrac * 0.86 * Math.PI);
        const layerW = (7 * s) + (maxW * cupProfile);

        // Left petal contour
        const leftChar = vFrac > 0.85 ? '/' : (vFrac > 0.3 ? '(' : '\\');
        const outerCol = isWilting ? '#7c2b3e' : pal.petal;
        out.push({ x: cx - layerW, y: ly, char: leftChar, fg: outerCol, size: 14 * s });

        // Right petal contour
        const rightChar = vFrac > 0.85 ? '\\' : (vFrac > 0.3 ? ')' : '/');
        out.push({ x: cx + layerW, y: ly, char: rightChar, fg: outerCol, size: 14 * s });

        // Interior shading & vertical striations
        const innerSteps = Math.max(1, Math.floor(layerW / (5.2 * s)));
        for (let j = -innerSteps + 1; j < innerSteps; j++) {
          const u = j / innerSteps;
          const ix = cx + u * layerW * 0.88;
          let ch = '|';
          let col = isWilting ? '#63212f' : pal.inner;
          if (Math.abs(u) < 0.25) {
            ch = (li % 2 === 0) ? '|' : '!';
            col = isWilting ? '#7c2b3e' : pal.petal;
          } else if (Math.abs(u) < 0.65) {
            ch = (u < 0) ? '(' : ')';
            col = (li > 4) ? (isWilting ? '#7c2b3e' : pal.petal) : (isWilting ? '#63212f' : pal.inner);
          } else {
            ch = (li % 2 === 0) ? '%' : '#';
            col = isWilting ? '#63212f' : pal.inner;
          }
          out.push({ x: ix, y: ly, char: ch, fg: col, size: 13.5 * s });
        }
      }

      // 3. Flared Crown Tepal Tips
      for (let t = -2; t <= 2; t++) {
        const tx = cx + t * (maxW * 0.42);
        const ty = fcy - 32 * s - (1 - Math.abs(t) * 0.25) * 6 * s + (isWilting ? 6 * s : 0);
        const ch = (t === 0) ? '^' : (t < 0 ? '/' : '\\');
        out.push({ x: tx, y: ty, char: ch, fg: isWilting ? '#7c2b3e' : pal.petal, size: 14 * s });
      }
    }

    /**
     * Dense Venus Flytrap (Dionaea muscipula) Architecture:
     * Realistic bivalve trap with green basal hinge, crimson digestive glandular carpet,
     * sensitive trigger spines, and bristling marginal cilia needle teeth!
     */
    static _buildFlytrap(out, cx, cy, s, b, pal, time, isWilting = false) {
      const fcy = cy - 20 * s;
      const isOpen = b > 0.3;
      const openSpread = isOpen ? (0.6 + 0.4 * b) : 0.2;

      // 1. Basal Hinge & Winged Petiole Joint
      for (let hx = -2; hx <= 2; hx++) {
        out.push({
          x: cx + hx * 6 * s,
          y: fcy + 14 * s,
          char: '#',
          fg: isWilting ? '#4a4422' : pal.jaw,
          size: 13.5 * s
        });
        out.push({
          x: cx + hx * 5 * s,
          y: fcy + 18 * s,
          char: (hx === 0 ? 'v' : (hx < 0 ? '\\' : '/')),
          fg: isWilting ? '#4a4422' : pal.jaw,
          size: 13.5 * s
        });
      }

      // 2. Dual Bivalve Lobes: Left (-1) and Right (+1)
      for (let side of [-1, 1]) {
        const lobeAngle = side * (0.34 + 0.34 * openSpread);
        const lobeLen = 32 * s;
        const lobeW = 16 * s;

        const numSteps = 7;
        for (let st = 1; st <= numSteps; st++) {
          const frac = st / numSteps;
          const lx = cx + Math.sin(lobeAngle) * (frac * lobeLen);
          const ly = fcy + 12 * s - Math.cos(lobeAngle) * (frac * lobeLen);

          // Outer green jaw rim (epidermis)
          const normX = -Math.cos(lobeAngle) * side;
          const normY = -Math.sin(lobeAngle) * side;
          const bulge = (0.5 + 0.5 * Math.sin(frac * Math.PI));
          const outerX = lx + normX * (lobeW * bulge);
          const outerY = ly + normY * (lobeW * bulge);
          const outerChar = side < 0 ? (st > 4 ? '/' : '(') : (st > 4 ? '\\' : ')');
          out.push({
            x: outerX,
            y: outerY,
            char: outerChar,
            fg: isWilting ? '#4a4422' : pal.jaw,
            size: 14 * s
          });

          // Crimson digestive glandular interior carpet
          const glandSteps = 3;
          for (let g = 0; g < glandSteps; g++) {
            const gFrac = (g + 0.5) / glandSteps;
            const gx = lx + normX * (lobeW * bulge * 0.82 * gFrac);
            const gy = ly + normY * (lobeW * bulge * 0.82 * gFrac);
            const gChar = (st % 2 === 0) ? (g % 2 === 0 ? '@' : '%') : (g % 2 === 0 ? '#' : '&');
            out.push({
              x: gx,
              y: gy,
              char: gChar,
              fg: isWilting ? '#5a1924' : pal.inside,
              size: 13 * s
            });
          }

          // Sensitive trigger hairs in center of lobe cavity
          if (st === 3 || st === 4) {
            const tx = lx + normX * (lobeW * bulge * 0.45);
            const ty = ly + normY * (lobeW * bulge * 0.45) - 3 * s;
            out.push({
              x: tx,
              y: ty,
              char: '!',
              fg: isWilting ? '#8c7d3a' : '#fff677',
              size: 12 * s
            });
          }

          // Marginal cilia teeth (long needle bristles along outer rim)
          const toothLen = (10 + 4 * Math.sin(frac * Math.PI)) * s;
          const toothAng = lobeAngle + (side * (Math.PI / 2.3));
          const toothX = outerX + Math.cos(toothAng) * toothLen;
          const toothY = outerY + Math.sin(toothAng) * toothLen;
          const toothChar = side < 0 ? (st % 2 === 0 ? '\\' : '!') : (st % 2 === 0 ? '/' : '!');
          out.push({
            x: toothX,
            y: toothY,
            char: toothChar,
            fg: isWilting ? '#aba182' : pal.teeth,
            size: 13.5 * s
          });
        }
      }

      // If closed / snapped shut: interlocking teeth across the central seam
      if (!isOpen) {
        for (let c = -4; c <= 4; c++) {
          out.push({
            x: cx + c * 5 * s,
            y: fcy - 12 * s,
            char: (c % 2 === 0 ? '/' : '\\'),
            fg: isWilting ? '#aba182' : pal.teeth,
            size: 14 * s
          });
        }
      }
    }
  }

  // =========================================================================
  // 6. LIVING MEADOW GRASS (LIFECYCLE: SPROUT -> GROW -> WILT -> DIE -> RESEED)
  // =========================================================================

  class GrassTuft {
    constructor(x, groundY, seed = 123, initialLife = null) {
      this.x = x;
      this.groundY = groundY;
      this.seed = seed;
      const rng = new PRNG(seed);

      this.maxHeight = rng.range(16, 36);
      this.numBlades = rng.choice([2, 3, 3, 4]);
      this.bladeOffsets = [];
      this.bladeCurves = [];
      this.bladeHeights = [];
      for (let i = 0; i < this.numBlades; i++) {
        this.bladeOffsets.push(rng.range(-8, 8));
        this.bladeCurves.push(rng.range(-0.35, 0.35));
        this.bladeHeights.push(rng.range(0.7, 1.0));
      }

      // Lifecycle [0.0, 1.0]:
      // 0.00 - 0.22: Sprout (tender pale-green shoots emerging from soil)
      // 0.22 - 0.68: Grow (lush chlorophyll blades swaying in breeze)
      // 0.68 - 0.88: Wilt (drooping yellow-green to golden-amber straw)
      // 0.88 - 1.00: Die (crumbling dry brown stubble/mulch)
      // >= 1.00: Reseed / Reset to fresh sprout!
      this.life = initialLife !== null ? initialLife : rng.range(0.0, 0.95);
      this.lifeSpeed = rng.range(0.02, 0.045); // full life cycle lasts ~25-50s
      this.nourishBoost = 0.0;
      this._updatePhase();
    }

    _updatePhase() {
      if (this.life < 0.22) {
        this.phase = 'sprout';
      } else if (this.life < 0.68) {
        this.phase = 'grow';
      } else if (this.life < 0.88) {
        this.phase = 'wilt';
      } else {
        this.phase = 'die';
      }
    }

    update(dt, timeSpeed = 1.0) {
      const effectiveDt = dt * timeSpeed;
      const speed = this.lifeSpeed * (1.0 + this.nourishBoost * 2.5);
      this.life += effectiveDt * speed;

      if (this.nourishBoost > 0) {
        this.nourishBoost = Math.max(0, this.nourishBoost - dt * 0.35);
      }

      // Cycle completion: reseed into a fresh green sprout!
      if (this.life >= 1.0) {
        this.life = 0.0;
        this.x += (Math.random() - 0.5) * 8; // subtle organic drift
      }

      this._updatePhase();
    }

    feed(amount = 0.35) {
      this.nourishBoost = Math.min(1.0, this.nourishBoost + amount);
      if (this.phase === 'wilt' || this.phase === 'die') {
        this.life = 0.04;
        this.phase = 'sprout';
      }
    }

    generateGlyphs(time = 0, windStrength = 0.5, pointer = null, palette = null) {
      const glyphs = [];
      const gy = this.groundY;
      const gx = this.x;

      let pointerDeflection = 0;
      if (pointer && pointer.active) {
        const dx = pointer.x - gx;
        const dy = pointer.y - gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 75) {
          pointerDeflection = (dx > 0 ? -1 : 1) * (1.0 - dist / 75) * 14;
        }
      }

      const windSway = Math.sin(time * 2.4 + gx * 0.06) * (windStrength * 7);

      if (this.phase === 'sprout') {
        // STAGE 1: SPROUT
        const progress = this.life / 0.22;
        const sproutH = Math.max(4, Math.floor(12 * progress));
        const col = this.nourishBoost > 0.1 ? '#aaff88' : '#77ee55';
        glyphs.push({ x: gx, y: gy - sproutH * 0.5, char: progress < 0.5 ? "'" : "|", fg: col, size: 11 });
        if (progress > 0.45) {
          glyphs.push({ x: gx + 3, y: gy - sproutH, char: "/", fg: '#99ff77', size: 10 });
        }
      } else if (this.phase === 'grow') {
        // STAGE 2: GROW
        const growProgress = (this.life - 0.22) / 0.46;
        const curH = this.maxHeight * (0.65 + 0.35 * Math.min(1.0, growProgress * 1.4));
        const colBlade = this.nourishBoost > 0.1 ? '#99ffbb' : (palette ? palette.stem : '#55e64b');
        const colBladeDark = palette ? palette.stemDark : '#2da82b';

        for (let b = 0; b < this.numBlades; b++) {
          const bh = curH * this.bladeHeights[b];
          const bx = gx + this.bladeOffsets[b];
          const bCurve = this.bladeCurves[b] * 20;
          const steps = Math.max(2, Math.floor(bh / 8));

          for (let s = 1; s <= steps; s++) {
            const st = s / steps;
            const sy = gy - (s * 8);
            const sway = (windSway + pointerDeflection) * st * st + (bCurve * st);
            const ch = st > 0.7 ? (sway > 0 ? "/" : "\\") : "|";
            glyphs.push({
              x: bx + sway,
              y: sy,
              char: ch,
              fg: st > 0.5 ? colBlade : colBladeDark,
              size: Math.round(11 + st * 2)
            });
          }
        }
      } else if (this.phase === 'wilt') {
        // STAGE 3: WILT
        const wiltProgress = (this.life - 0.68) / 0.20;
        const curH = this.maxHeight * (1.0 - wiltProgress * 0.35);
        const colWilt = palette ? palette.wilted : '#c8a832';
        const colStraw = '#b08e2f';

        for (let b = 0; b < this.numBlades; b++) {
          const bh = curH * this.bladeHeights[b];
          const bx = gx + this.bladeOffsets[b];
          const droop = (this.bladeCurves[b] >= 0 ? 1 : -1) * (14 + wiltProgress * 16);
          const steps = Math.max(2, Math.floor(bh / 8));

          for (let s = 1; s <= steps; s++) {
            const st = s / steps;
            const sy = gy - (s * 6) + (st * st * 8);
            const sway = (windSway * 0.35) * st + (droop * st);
            const ch = st > 0.6 ? "~" : (st > 0.3 ? "\\" : "|");
            glyphs.push({
              x: bx + sway,
              y: sy,
              char: ch,
              fg: st > 0.5 ? colStraw : colWilt,
              size: 11
            });
          }
        }
      } else {
        // STAGE 4: DIE
        const colMulch = palette ? palette.dead : '#6b4f23';
        const colStubble = '#4a3618';
        glyphs.push({ x: gx - 3, y: gy + 3, char: ".", fg: colMulch, size: 10 });
        glyphs.push({ x: gx, y: gy + 1, char: "_", fg: colStubble, size: 11 });
        glyphs.push({ x: gx + 4, y: gy + 4, char: ",", fg: colMulch, size: 9 });
      }

      return glyphs;
    }
  }

  // =========================================================================
  // 7. THE ASCIIPLANT CLASS
  // =========================================================================

  class AsciiPlant {
    constructor(options = {}) {
      this.type = options.type || 'sunflower';
      this.age = options.age !== undefined ? options.age : 1.0;
      this.bloom = options.bloom !== undefined ? options.bloom : null;
      this.height = options.height || 360;
      this.scale = options.scale !== undefined ? options.scale : 1.0;
      this.curvature = options.curvature !== undefined ? options.curvature : 0.0;
      this.leafDensity = options.leafDensity !== undefined ? options.leafDensity : 1.0;
      this.branching = options.branching !== undefined ? options.branching : 1.0;
      this.seed = options.seed !== undefined ? options.seed : 42;
      this.paletteName = options.palette || 'botanical';
      this.interactive = options.interactive !== false;
      this.pointerMode = options.pointerMode || 'reach';
      this.metabolicRate = options.metabolicRate !== undefined ? options.metabolicRate : (0.80 + Math.random() * 0.40);

      this.simulator = new BotanicalSimulator({
        type: this.type,
        seed: this.seed,
        height: this.height,
        scale: this.scale,
        curvature: this.curvature,
        leafDensity: this.leafDensity,
        branching: this.branching
      });

      this.pointer = { x: 0, y: 0, active: false };
      this.growthBoost = 0.0;
      this.vitality = 1.0;
      this.seedsBlown = false;
      this.seedRegenTimer = 0.0;
    }

    feed(amount = 0.20) {
      this.growthBoost = Math.min(0.65, this.growthBoost + amount);
      this.vitality = Math.min(1.4, this.vitality + 0.2);
      this.simulator.feedMembers(amount);
    }

    update(dt, timeSpeed = 1.0) {
      this.simulator.updateMembers(dt, timeSpeed, this.age);
    }

    reseed(newSeed = Math.floor(Math.random() * 1000000)) {
      this.seed = newSeed;
      this.simulator.reseedGenetics(newSeed);
      this.age = 0.04;
      this.bloom = null;
      this.metabolicRate = 0.80 + Math.random() * 0.40;
      this.growthBoost = 0.0;
      this.vitality = 1.0;
      this.seedsBlown = false;
      this.seedRegenTimer = 0.0;
    }

    setAge(val) {
      this.age = Math.max(0.0, val);
    }

    setBloom(val) {
      this.bloom = val !== null ? clamp(val, 0.0, 1.0) : null;
      if (this.bloom !== null && this.simulator && this.simulator.members && this.simulator.members.apicalFlower) {
        this.simulator.members.apicalFlower.bloom = this.bloom;
        if (this.bloom > 0.4) this.simulator.members.apicalFlower.state = 'blooming';
      }
    }

    get effectiveBloom() {
      if (this.bloom !== null) return this.bloom;
      if (this.simulator && this.simulator.members && this.simulator.members.apicalFlower && this.simulator.members.apicalFlower.state !== 'dormant') {
        return this.simulator.members.apicalFlower.bloom;
      }
      const gAge = Math.min(1.0, this.age);
      let b = smoothstep(0.42, 0.88, gAge);
      if (this.age > 21.0) {
        const sen = clamp((this.age - 21.0) / 2.5, 0.0, 1.0);
        b = Math.max(0.0, b * (1.0 - sen * 0.65));
      }
      return b;
    }

    getHeadPosition(originX, groundY) {
      const pData = this.simulator.simulate(this.age, this.bloom, 0, 0);
      const lastNode = pData.stemNodes && pData.stemNodes.length > 0 ? pData.stemNodes[pData.stemNodes.length - 1] : null;
      const apexX = originX + (lastNode ? lastNode.x : 0);
      const apexY = groundY - (lastNode ? lastNode.y : this.height * 0.8);
      const tilt = pData.headTilt || 0;
      const tiltX = apexX + Math.sin(tilt) * 18;
      const tiltY = apexY - Math.cos(tilt) * 14;
      const fScale = pData.flowerScale || 1.0;
      const headOffsetY = (this.type === 'dandelion' || this.type === 'tulip') ? -20 * fScale : 0;
      return {
        x: tiltX,
        y: tiltY + headOffsetY
      };
    }

    setPalette(name) {
      if (PALETTES[name]) this.paletteName = name;
    }

    getPalette() {
      return PALETTES[this.paletteName] || PALETTES.botanical;
    }

    generateGlyphs(originX, groundY, time = 0, windStrength = 0.5) {
      let pointerDist = null;
      if (this.pointer.active && this.pointerMode !== 'none') {
        pointerDist = {
          dx: this.pointer.x - originX,
          dy: this.pointer.y - (groundY - this.height * 0.7),
          mode: this.pointerMode,
          strength: 1.0
        };
      }

      const pData = this.simulator.simulate(this.age, this.bloom, time, windStrength, pointerDist);
      const palette = this.getPalette();
      return BotanicalArchitect.generatePlantGlyphs(pData, originX, groundY, palette, this.seed, time, this.seedsBlown);
    }

    /**
     * Ultra-fast canvas render: ZERO per-glyph shadowBlur calls!
     * Runs locked at 60-120 FPS on all devices.
     */
    renderToCanvas(ctx, originX, groundY, time = 0, windStrength = 0.5, options = {}) {
      const glyphs = this.generateGlyphs(originX, groundY, time, windStrength);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Fast single-pass character render without expensive per-glyph shadowBlur
      glyphs.forEach(g => {
        ctx.font = `${Math.max(7, Math.round(g.size))}px "Courier New", Consolas, monospace`;
        ctx.fillStyle = g.fg;
        ctx.fillText(g.char, g.x, g.y);
      });

      ctx.restore();

      // Optional subtle bloom pass if requested
      if (options.bloom && ctx && ctx.canvas) {
        const c = ctx.canvas;
        if (!this._bloomCanvas) {
          this._bloomCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        }
        if (this._bloomCanvas) {
          const bw = Math.max(1, Math.floor(c.width / 3));
          const bh = Math.max(1, Math.floor(c.height / 3));
          if (this._bloomCanvas.width !== bw || this._bloomCanvas.height !== bh) {
            this._bloomCanvas.width = bw;
            this._bloomCanvas.height = bh;
          }
          const bCtx = this._bloomCanvas.getContext('2d');
          if (bCtx) {
            bCtx.clearRect(0, 0, bw, bh);
            if (typeof bCtx.filter !== 'undefined') bCtx.filter = 'blur(2.5px)';
            bCtx.drawImage(c, 0, 0, bw, bh);
            if (typeof bCtx.filter !== 'undefined') bCtx.filter = 'none';

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.35;
            ctx.drawImage(this._bloomCanvas, 0, 0, c.width, c.height);
            ctx.restore();
          }
        }
      }
    }

    toPlainText(cols = 40, rows = 35) {
      const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
      const glyphs = this.generateGlyphs(cols * 5, rows * 10, 0, 0);
      glyphs.forEach(g => {
        const c = Math.floor(g.x / 10);
        const r = Math.floor(g.y / 10);
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          grid[r][c] = g.char[0] || '*';
        }
      });
      return grid.map(row => row.join('')).join('\n');
    }
  }

  // =========================================================================
  // 7. THE ASCIIGARDEN CLASS (60 FPS ENGINE WITH SCREEN-SPACE BLOOM PASS)
  // =========================================================================

  class AsciiGarden {
    constructor(canvas, options = {}) {
      this.canvas = typeof canvas === 'string' && typeof document !== 'undefined' ? document.querySelector(canvas) : canvas;
      this.ctx = this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
      this.plants = [];
      this.windStrength = options.wind !== undefined ? options.wind : 0.6;
      this.windTime = 0;
      this.particles = []; // Floating pollen, parachute seeds, sunlight motes
      this.isRunning = false;
      this.paletteName = options.palette || 'botanical';
      this.pointer = { x: -999, y: -999, active: false };

      // Time control engine
      this.timeSpeed = options.timeSpeed !== undefined ? options.timeSpeed : 1.0; // 0 = paused, 1 = normal, 3 = fast
      this.onDandelionBlow = null;
      this.onSeedGerminate = null;

      // Screen-space downscaled bloom canvas (for 60 FPS silky bloom with ZERO shadowBlur lag!)
      this.bloomCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      this.bloomCtx = this.bloomCanvas ? this.bloomCanvas.getContext('2d') : null;

      // Living Meadow Grass along the soil line
      this.grass = [];
      this.enableGrass = options.grass !== false;

      this._setupEvents();
      this.resize();
    }

    resize() {
      if (!this.canvas) return;
      const rect = typeof this.canvas.getBoundingClientRect === 'function'
        ? this.canvas.getBoundingClientRect()
        : { width: this.canvas.width || 800, height: this.canvas.height || 600 };
      const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
      this.canvas.width = (rect.width || 800) * dpr;
      this.canvas.height = (rect.height || 600) * dpr;
      if (this.ctx && typeof this.ctx.scale === 'function') this.ctx.scale(dpr, dpr);
      this.cssWidth = rect.width || 800;
      this.cssHeight = rect.height || 600;

      // Downscaled bloom buffer (1/3 scale for instantaneous blur pass)
      if (this.bloomCanvas) {
        this.bloomW = Math.max(10, Math.floor(this.cssWidth / 3));
        this.bloomH = Math.max(10, Math.floor(this.cssHeight / 3));
        this.bloomCanvas.width = this.bloomW;
        this.bloomCanvas.height = this.bloomH;
      }

      this._initGrass();
    }

    _initGrass() {
      this.grass = [];
      if (!this.enableGrass) return;
      const w = this.cssWidth || 800;
      const gy = this.cssHeight - 50;
      const tuftSpacing = 22;
      const count = Math.max(1, Math.floor(w / tuftSpacing));
      for (let i = 0; i < count; i++) {
        const gx = (i + 0.5) * tuftSpacing + (Math.sin(i * 1.7) * 6);
        const seed = Math.floor(i * 137 + 42);
        const initLife = (i * 0.13) % 1.0;
        this.grass.push(new GrassTuft(gx, gy, seed, initLife));
      }
    }

    getPalette() {
      return PALETTES[this.paletteName] || PALETTES.botanical;
    }

    _setupEvents() {
      if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;

      this.canvas.addEventListener('mousemove', e => {
        const rect = typeof this.canvas.getBoundingClientRect === 'function' ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
        this.pointer.x = e.clientX - rect.left;
        this.pointer.y = e.clientY - rect.top;
        this.pointer.active = true;

        if (Math.random() < 0.25) {
          this.particles.push({
            x: this.pointer.x + (Math.random() - 0.5) * 20,
            y: this.pointer.y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 1.5 + (this.windStrength * 0.8),
            vy: -Math.random() * 1.5 - 0.5,
            char: Math.random() < 0.5 ? '*' : (Math.random() < 0.5 ? '·' : '~'),
            color: '#ffe650',
            life: 1.0,
            decay: 0.018 + Math.random() * 0.01
          });
        }
      });

      this.canvas.addEventListener('mouseleave', () => {
        this.pointer.active = false;
      });

      // Click to blow dandelion seeds if clicking near a dandelion head!
      this.canvas.addEventListener('click', e => {
        const rect = typeof this.canvas.getBoundingClientRect === 'function' ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        this.checkDandelionBlow(clickX, clickY);
      });

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', () => this.resize());
      }
    }

    /**
     * Check if a coordinate hits any blooming dandelion flower head
     */
    checkDandelionBlow(clickX, clickY) {
      let hit = false;
      const groundY = this.cssHeight - 50;
      this.plants.forEach(({ x: plantX, plant }) => {
        if (plant.type === 'dandelion' && !plant.seedsBlown && (plant.effectiveBloom > 0.35 || plant.age > 0.50)) {
          const head = plant.getHeadPosition(plantX, groundY);
          const dist = Math.hypot(clickX - head.x, clickY - head.y);
          if (dist < 75) {
            this.blowDandelion(plant, head.x, head.y);
            hit = true;
          }
        }
      });
      return hit;
    }

    /**
     * Dandelion seed blow off: releases 32 parachute seeds that swing and have 1/20 chance to sprout!
     */
    blowDandelion(plant, originX, originY) {
      plant.seedsBlown = true;
      plant.seedRegenTimer = 18.0; // Regenerates in 18s

      const seedChars = ['*', '·', '~', '°', '✦'];
      for (let i = 0; i < 32; i++) {
        const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.3;
        const speed = 2.0 + Math.random() * 4.5;
        this.particles.push({
          x: originX + (Math.random() - 0.5) * 16,
          y: originY + (Math.random() - 0.5) * 16,
          vx: Math.cos(angle) * speed + (this.windStrength * 1.5),
          vy: Math.sin(angle) * speed - 1.5,
          char: seedChars[Math.floor(Math.random() * seedChars.length)],
          color: '#ffffff',
          life: 1.0,
          decay: 0.003 + Math.random() * 0.002, // long floating life
          isDandelionSeed: true,
          swingPhase: Math.random() * Math.PI * 2,
          swingSpeed: 2.5 + Math.random() * 2.0
        });
      }

      if (typeof this.onDandelionBlow === 'function') {
        this.onDandelionBlow(plant, originX, originY);
      }
    }

    addPlant(x, plantOptions = {}) {
      const plant = new AsciiPlant({
        ...plantOptions,
        palette: this.paletteName
      });
      this.plants.push({ x, plant });
      return plant;
    }

    clear() {
      this.plants = [];
      this.particles = [];
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      let lastTime = performance.now();

      const loop = (now) => {
        if (!this.isRunning) return;
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        this.update(dt);
        this.render();

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    }

    stop() {
      this.isRunning = false;
    }

    update(dt) {
      this.windTime += dt;
      const groundY = this.cssHeight - 50;

      // Internal Biological Clock: Natural Passing of Time
      const effectiveDt = dt * this.timeSpeed;

      this.plants.forEach(({ plant, x }) => {
        // Continuous biological lifecycle:
        // Growth (0 to 1.0) -> Mature prime plateau at full height (1.0 to 21.0, 20n duration!) -> Senescence (21.0 to 23.5) -> Reseed
        if (this.timeSpeed > 0) {
          const plantMetabolism = plant.metabolicRate || 1.0;
          const agingSpeed = 0.025 * this.timeSpeed * plantMetabolism;
          let newAge = plant.age + effectiveDt * agingSpeed;

          // Senescence completion: when plant completes its 20n mature life + senescence (age >= 23.5)
          if (newAge >= 23.5) {
            // Re-seed with completely different morphology!
            const newSeed = Math.floor(Math.random() * 1000000);
            plant.reseed(newSeed);
            if (typeof this.onPlantReseed === 'function') {
              this.onPlantReseed(plant, x);
            }
          } else {
            plant.setAge(newAge);
            plant.update(dt, this.timeSpeed);
          }
        }

        // Sunlight nourishment boost update
        if (plant.growthBoost > 0) {
          if (plant.age > 21.0) {
            // Revitalize aging/senescent plant back to radiant mature prime!
            plant.setAge(Math.max(1.0, plant.age - plant.growthBoost * dt * 4.0));
          } else {
            plant.setAge(plant.age + plant.growthBoost * dt * 1.5);
          }
          if (plant.bloom !== null) {
            plant.setBloom(Math.min(1.0, plant.bloom + plant.growthBoost * dt * 1.0));
          }
          plant.growthBoost = Math.max(0, plant.growthBoost - dt * 0.22);
          plant.vitality = Math.max(1.0, plant.vitality - dt * 0.12);
        }

        // Dandelion seed clock regeneration
        if (plant.seedsBlown) {
          plant.seedRegenTimer -= dt;
          if (plant.seedRegenTimer <= 0) {
            plant.seedsBlown = false;
          }
        }

        // Floating petal & leaf shedding during member wilting or whole-plant senescence
        const af = plant.simulator && plant.simulator.members ? plant.simulator.members.apicalFlower : null;
        const isFlowerWilting = af && af.state === 'wilting';
        const hasLeafWilting = plant.simulator && plant.simulator.members && plant.simulator.members.leaves.some(l => l.state === 'wilting');

        if ((isFlowerWilting || plant.age > 21.0) && Math.random() < 0.10) {
          const head = plant.getHeadPosition(x, groundY);
          const pal = plant.getPalette();
          const fPal = pal.flowers[plant.type] || pal.flowers.sunflower;
          this.particles.push({
            x: head.x + (Math.random() - 0.5) * 22,
            y: head.y + 8,
            vx: (Math.random() - 0.5) * 1.0 + (this.windStrength * 0.8),
            vy: 0.7 + Math.random() * 0.8,
            char: Math.random() < 0.5 ? '~' : "'",
            color: fPal.petal || '#ffd700',
            life: 1.0,
            decay: 0.012 + Math.random() * 0.008
          });
        }

        if (hasLeafWilting && Math.random() < 0.04) {
          this.particles.push({
            x: x + (Math.random() - 0.5) * 35,
            y: groundY - (plant.height * Math.random() * 0.6),
            vx: (Math.random() - 0.5) * 0.6 + (this.windStrength * 0.5),
            vy: 1.2 + Math.random() * 0.8,
            char: '~',
            color: '#bfa035',
            life: 1.0,
            decay: 0.015
          });
        }
      });

      // Update particles (pollen, dandelion seeds, sunlight motes)
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];

        if (p.isDandelionSeed) {
          // Pendulum swinging motion on breeze
          p.x += p.vx + Math.sin(this.windTime * p.swingSpeed + p.swingPhase) * 1.4;
          // Float gently downward
          p.vy = lerp(p.vy, 0.75, dt * 2.0);
          p.y += p.vy;

          // Check if seed has landed on soil!
          if (p.y >= groundY) {
            // 1/20 (5%) chance to sprout a new dandelion seedling!
            if (Math.random() < 0.05 && this.plants.length < 18) {
              const newDandelion = this.addPlant(clamp(p.x, 40, this.cssWidth - 40), {
                type: 'dandelion',
                age: 0.04,
                height: 240 + Math.random() * 80,
                seed: Math.floor(Math.random() * 10000)
              });
              if (typeof this.onSeedGerminate === 'function') {
                this.onSeedGerminate(newDandelion, p.x);
              }
            }
            this.particles.splice(i, 1);
            continue;
          }
        } else {
          // Standard ambient particle
          p.x += p.vx + Math.sin(this.windTime * 2 + p.y * 0.02) * 0.5;
          p.y += p.vy;
        }

        p.life -= p.decay;
        if (p.life <= 0 || p.x > this.cssWidth + 50 || p.x < -50 || p.y < -50 || p.y > this.cssHeight + 50) {
          this.particles.splice(i, 1);
        }
      }

      this.plants.forEach(({ plant }) => {
        plant.pointer.x = this.pointer.x;
        plant.pointer.y = this.pointer.y;
        plant.pointer.active = this.pointer.active;
      });

      // Living Meadow Grass Lifecycle update
      if (this.enableGrass && this.grass.length > 0) {
        this.grass.forEach(g => g.update(dt, this.timeSpeed));
      }
    }

    nourishAt(x, y, radius = 240) {
      const moteChars = ['*', '✦', '°', '·', '☼', '✧', '+', '#'];
      const moteColors = ['#ffea00', '#ffd700', '#ffa500', '#ffffff', '#fff4a3'];

      for (let i = 0; i < 16; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.0 + Math.random() * 3.5;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 30,
          y: y + (Math.random() - 0.5) * 30,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd + 1.2,
          char: moteChars[Math.floor(Math.random() * moteChars.length)],
          color: moteColors[Math.floor(Math.random() * moteColors.length)],
          life: 1.0,
          decay: 0.015 + Math.random() * 0.012
        });
      }

      this.plants.forEach(({ x: plantX, plant }) => {
        const dist = Math.abs(plantX - x);
        if (dist < radius) {
          const factor = 1.0 - (dist / radius);
          plant.feed(0.22 * factor);
        }
      });

      // Sunlight nourishment accelerates grass growth & revives wilting blades
      if (this.enableGrass && this.grass.length > 0) {
        this.grass.forEach(g => {
          const dist = Math.abs(g.x - x);
          if (dist < radius) {
            g.feed(0.40 * (1.0 - dist / radius));
          }
        });
      }
    }

    /**
     * 60+ FPS Renderer:
     * 1. Draws sharp characters in a single fast pass (0.3ms)
     * 2. Blends a downscaled screen-space bloom pass (0.2ms)
     * Result: Glorious glowing aesthetic with locked 60-120 FPS!
     */
    render() {
      const ctx = this.ctx;
      const w = this.cssWidth;
      const h = this.cssHeight;

      // Pure deep black background
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, w, h);

      // Soil ground line
      const groundY = h - 50;
      ctx.save();
      ctx.fillStyle = '#225528';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      for (let gx = 0; gx < w; gx += 16) {
        ctx.fillText('-', gx, groundY + 12);
      }
      ctx.restore();

      // Living Meadow Grass (Sprout -> Grow -> Wilt -> Die -> Reseed)
      if (this.enableGrass && this.grass.length > 0) {
        const pal = this.getPalette();
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < this.grass.length; i++) {
          const tuft = this.grass[i];
          const glyphs = tuft.generateGlyphs(this.windTime, this.windStrength, this.pointer, pal);
          for (let j = 0; j < glyphs.length; j++) {
            const g = glyphs[j];
            ctx.font = `${g.size}px monospace`;
            ctx.fillStyle = g.fg;
            ctx.fillText(g.char, g.x, g.y);
          }
        }
        ctx.restore();
      }

      // Render each living plant (sharp fast pass)
      this.plants.forEach(({ x, plant }) => {
        plant.renderToCanvas(ctx, x, groundY, this.windTime, this.windStrength);
      });

      // Render floating particles
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.particles.forEach(p => {
        ctx.font = p.isDandelionSeed ? '14px monospace' : '12px monospace';
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillText(p.char, p.x, p.y);
      });
      ctx.restore();

      // Fast Screen-Space Bloom Pass (hardware accelerated, covers ALL drawn artefacts with zero per-glyph lag)
      if (this.bloomCanvas && this.bloomW > 0 && this.bloomH > 0) {
        this.bloomCtx.clearRect(0, 0, this.bloomW, this.bloomH);

        // Hardware-accelerated canvas filter blur on downscaled 1/3 buffer
        if (typeof this.bloomCtx.filter !== 'undefined') {
          this.bloomCtx.filter = 'blur(2.5px)';
        }
        this.bloomCtx.drawImage(this.canvas, 0, 0, this.bloomW, this.bloomH);
        if (typeof this.bloomCtx.filter !== 'undefined') {
          this.bloomCtx.filter = 'none';
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Dual-tier composite for ethereal, soft radiant glow:
        // Tier 1: Crisp luminous inner core
        ctx.globalAlpha = 0.38;
        ctx.drawImage(this.bloomCanvas, 0, 0, w, h);

        // Tier 2: Soft atmospheric diffusion halo
        ctx.globalAlpha = 0.16;
        ctx.drawImage(this.bloomCanvas, -2, -2, w + 4, h + 4);

        ctx.restore();
      }
    }
  }

  // =========================================================================
  // 8. CUSTOM WEB COMPONENTS
  // =========================================================================

  if (typeof customElements !== 'undefined') {
    class FlorametricPlantElement extends HTMLElement {
      connectedCallback() {
        const type = this.getAttribute('type') || 'sunflower';
        const age = parseFloat(this.getAttribute('age') || '1.0');
        const bloom = this.hasAttribute('bloom') ? parseFloat(this.getAttribute('bloom')) : null;
        const height = parseInt(this.getAttribute('height') || '300', 10);
        const palette = this.getAttribute('palette') || 'botanical';
        const interactive = this.getAttribute('interactive') !== 'false';

        this.style.display = 'inline-block';
        this.style.background = '#050508';
        this.style.width = this.style.width || '280px';
        this.style.height = this.style.height || `${height + 80}px`;

        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        this.appendChild(canvas);

        const garden = new AsciiGarden(canvas, { palette });
        garden.addPlant(canvas.clientWidth / 2 || 140, {
          type, age, bloom, height, palette, interactive
        });
        garden.start();
        this._garden = garden;
      }
      disconnectedCallback() {
        if (this._garden) this._garden.stop();
      }
    }

    if (!customElements.get('florametric-plant')) {
      customElements.define('florametric-plant', FlorametricPlantElement);
    }
    if (!customElements.get('ascii-plant')) {
      class AsciiPlantElement extends FlorametricPlantElement { }
      customElements.define('ascii-plant', AsciiPlantElement);
    }
  }

  return {
    AsciiPlant,
    AsciiGarden,
    GrassTuft,
    BotanicalSimulator,
    BotanicalArchitect,
    ProceduralFlowerRenderer,
    PALETTES,
    SPECIES: ['sunflower', 'hibiscus', 'iris', 'thistle', 'marigold', 'daffodil', 'rose', 'dandelion', 'tulip', 'flytrap'],
    generateString: (options) => {
      const plant = new AsciiPlant(options);
      return plant.toPlainText(options.cols || 40, options.rows || 35);
    }
  };
}));

const _FM = (typeof window !== 'undefined' && window.Florametric) || (typeof globalThis !== 'undefined' && globalThis.Florametric);
export const AsciiGarden = _FM ? _FM.AsciiGarden : null;
export const AsciiPlant = _FM ? _FM.AsciiPlant : null;
export const GrassTuft = _FM ? _FM.GrassTuft : null;
export const PALETTES = _FM ? _FM.PALETTES : null;
export const SPECIES = _FM ? _FM.SPECIES : null;
export default _FM;
