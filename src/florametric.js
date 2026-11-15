/**
 * Florametric — Pure Parametric & Procedural Botanical Generation
 * Zero-dependency, 100% mathematical generative system for living ASCII plants & flowers.
 *
 * Layered architecture (each layer only depends on the layers above it):
 *   1. Math, PRNG, simplex noise & colour utilities
 *   2. Palettes
 *   3. Genome            — the heritable traits a plant is born with
 *   4. BotanicalSimulator — growth, member lifecycles and noise-driven variation
 *   5. BotanicalArchitect / ProceduralFlowerRenderer — geometry -> glyph lists
 *   6. GlyphRenderer / TextRasterizer — glyph lists -> canvas (sprite atlas, rotation) or plain text
 *   7. WindField, GrassTuft, AsciiPlant, AsciiGarden — the living scene
 *   8. Web Components (<florametric-plant> / <ascii-plant>)
 *
 * Glyph contract: { x, y, char, fg, size, rot?, alpha? } where rot is a clockwise
 * rotation in radians around the glyph centre.
 */

(function (root, factory) {
  const lib = factory();
  if (typeof define === 'function' && define.amd) {
    define([], () => lib);
  }
  if (root) {
    root.Florametric = lib;
    root.AsciiPlants = lib;
    root.AsciiPlant = lib.AsciiPlant;
    root.AsciiGarden = lib.AsciiGarden;
    root.GrassTuft = lib.GrassTuft;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.Florametric = lib;
    globalThis.AsciiPlants = lib;
  }
}(typeof self !== 'undefined' ? self : this, function () {

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
    int(max = 0x7fffffff) {
      return Math.floor(this.next() * max);
    }
    // Approximately normal(0, 1) via the sum of uniforms (Irwin–Hall, n = 4)
    gauss() {
      return (this.next() + this.next() + this.next() + this.next() - 2.0) * 1.7320508;
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

  /**
   * Seeded 2D simplex noise (after Stefan Gustavson) with fractal Brownian motion.
   * Unlike Math.random(), neighbouring inputs give neighbouring outputs, which is what
   * makes variation read as organic growth instead of jitter. Output is in [-1, 1].
   */
  const GRAD2 = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];

  class SimplexNoise {
    constructor(seed = 1) {
      const rng = new PRNG(seed);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = p[i]; p[i] = p[j]; p[j] = t;
      }
      this.perm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    noise2(x, y) {
      const F2 = 0.3660254037844386;
      const G2 = 0.21132486540518713;
      const s = (x + y) * F2;
      const i = Math.floor(x + s);
      const j = Math.floor(y + s);
      const t = (i + j) * G2;
      const x0 = x - (i - t);
      const y0 = y - (j - t);
      const i1 = x0 > y0 ? 1 : 0;
      const j1 = 1 - i1;
      const x1 = x0 - i1 + G2;
      const y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2;
      const y2 = y0 - 1 + 2 * G2;
      const perm = this.perm;
      const ii = i & 255;
      const jj = j & 255;
      let n = 0;

      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) {
        const g = (perm[ii + perm[jj]] & 7) * 2;
        t0 *= t0;
        n += t0 * t0 * (GRAD2[g] * x0 + GRAD2[g + 1] * y0);
      }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) {
        const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2;
        t1 *= t1;
        n += t1 * t1 * (GRAD2[g] * x1 + GRAD2[g + 1] * y1);
      }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) {
        const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2;
        t2 *= t2;
        n += t2 * t2 * (GRAD2[g] * x2 + GRAD2[g + 1] * y2);
      }
      return 70 * n;
    }

    fbm2(x, y, octaves = 3) {
      let sum = 0;
      let amp = 1;
      let norm = 0;
      let freq = 1;
      for (let o = 0; o < octaves; o++) {
        sum += this.noise2(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
      }
      return sum / norm;
    }

    fbm1(x, octaves = 3) {
      return this.fbm2(x, 17.31, octaves);
    }
  }

  // Colour utilities (hex <-> HSL), memoised because palettes are tinted per plant
  const _tintCache = new Map();

  function hexToRgb(hex) {
    let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    const c = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = t => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
  }

  /**
   * Blend two hex colours. t is quantised to `steps` levels so gradual transitions
   * (e.g. ageing stems) still map onto a small, bounded set of colours.
   */
  function mixColor(a, b, t, steps = 8) {
    const q = Math.round(clamp(t, 0, 1) * steps) / steps;
    if (q <= 0 || typeof b !== 'string') return a;
    if (q >= 1 || typeof a !== 'string') return b;
    const key = `${a}|${b}|${q}`;
    let out = _tintCache.get(key);
    if (out === undefined) {
      const ca = hexToRgb(a);
      const cb = hexToRgb(b);
      out = rgbToHex(ca[0] + (cb[0] - ca[0]) * q, ca[1] + (cb[1] - ca[1]) * q, ca[2] + (cb[2] - ca[2]) * q);
      _tintCache.set(key, out);
    }
    return out;
  }

  /**
   * Shift a hex colour in HSL space. Results are quantised and memoised so a garden of
   * plants maps onto a small, bounded set of colours (important for the glyph atlas).
   */
  function tintColor(hex, dHue, dSat, dLight) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#') return hex;
    const qh = Math.round(dHue);
    const qs = Math.round(dSat * 50) / 50;
    const ql = Math.round(dLight * 50) / 50;
    if (qh === 0 && qs === 0 && ql === 0) return hex;
    const key = `${hex}|${qh}|${qs}|${ql}`;
    let out = _tintCache.get(key);
    if (out === undefined) {
      const [h, s, l] = rgbToHsl(...hexToRgb(hex));
      out = rgbToHex(...hslToRgb(h + qh, clamp(s + qs, 0, 1), clamp(l + ql, 0.05, 0.95)));
      _tintCache.set(key, out);
    }
    return out;
  }

  // =========================================================================
  // 2. CHROMATIC PALETTES
  // =========================================================================

  const PALETTES = {
    botanical: {
      id: 'botanical',
      colorVariance: 1.0,
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
      colorVariance: 0.15,
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
      colorVariance: 0.15,
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
      colorVariance: 0.6,
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
      colorVariance: 0.0,
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
  // 3. GENOME — HERITABLE TRAITS A PLANT IS BORN WITH
  // =========================================================================

  const STEM_HABITS = ['erect', 'curved_left', 'curved_right', 's_curve', 'windswept', 'zigzag'];

  // [min, max] of every numeric gene. Factors are multipliers around 1.0;
  // colour genes are normalised to [-1, 1] and scaled per species & palette.
  const TRAIT_RANGES = {
    lifeFactor: [0.70, 1.40],      // longevity: stretches the mature prime & member lifespans
    vigor: [0.80, 1.25],           // metabolic growth rate
    branching: [0.25, 1.50],       // axillary branch count & spread
    leafing: [0.60, 1.50],         // leaf cluster count & leaf size
    flowering: [0.65, 1.40],       // flower size, bloom duration & branch-flower fertility
    size: [0.85, 1.22],            // overall shoot height & flower scale
    hue: [-1.0, 1.0],              // petal hue shift (range set per species)
    saturation: [-1.0, 1.0],
    lightness: [-1.0, 1.0],
    growthNoise: [0.08, 0.28],     // amplitude of noise on growth velocity & member emergence
    shapeNoise: [0.35, 1.10],      // stem meander, leaf tilt & petal irregularity
    windSensitivity: [0.75, 1.30]  // stem flexibility
  };

  // Natural colour diversity per species, in hue degrees at hue = ±1
  // (tulips & roses come in many colours; sunflowers & daffodils barely vary).
  const SPECIES_HUE_RANGE = {
    sunflower: 10, hibiscus: 40, iris: 28, thistle: 22, marigold: 14,
    daffodil: 8, rose: 55, dandelion: 6, tulip: 70, flytrap: 12
  };

  // -------------------------------------------------------------------------
  // Drawing primitives: glyphs aligned to the curve they belong to
  // -------------------------------------------------------------------------

  // Deterministic 0..1 hash for per-node / per-petal variation
  function hash01(a, b = 0) {
    return (Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 1274126177) >>> 0) / 4294967296;
  }

  /**
   * ASCII glyph for a stroke heading in screen direction theta: the nearest of
   * - \ | / (using their real slopes in a monospace cell, ~59° for the diagonals),
   * plus the small residual rotation that keeps curves smooth.
   */
  const DIR_GLYPHS = [['-', 0], ['\\', 1.03], ['|', Math.PI / 2], ['/', 2.11], ['-', Math.PI]];
  function asciiFor(theta) {
    let a = theta % Math.PI;
    if (a < 0) a += Math.PI;
    let best = DIR_GLYPHS[0];
    let bestD = Infinity;
    for (let i = 0; i < DIR_GLYPHS.length; i++) {
      const d = Math.abs(a - DIR_GLYPHS[i][1]);
      if (d < bestD) { bestD = d; best = DIR_GLYPHS[i]; }
    }
    return { char: best[0], rot: a - best[1] };
  }

  // ASCII glyph for an upward stroke leaning r radians clockwise from vertical
  function stemGlyph(r) {
    return asciiFor(r - Math.PI / 2);
  }

  /**
   * Resample a polyline at an even spacing and emit one glyph per sample.
   * Styles:
   *  - default: direction-matched ASCII (| / - \) with a small residual rotation
   *  - bracket: -1 / 1 -> '(' / ')' turned along the path (petal & leaf outlines)
   *  - chars:  cycle through texture characters, kept upright (fills, hatching)
   *  - char:   one fixed glyph turned along the path
   * fg may be a colour or a function of the path fraction (0 at start, 1 at end).
   */
  function strokeAlong(out, pts, fg, size, opts = {}) {
    if (!pts || pts.length < 2) return;
    const spacing = opts.spacing || size * 0.82;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (total < 0.5) return;
    let carry = Math.min(spacing * 0.5, total * 0.5);
    let walked = 0;
    let n = opts.phase || 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const theta = Math.atan2(dy, dx);
      let char;
      let rot;
      if (opts.chars) {
        char = null;
        rot = opts.align === 'tangent' ? theta + Math.PI / 2 : 0;
      } else if (opts.bracket) {
        char = opts.bracket < 0 ? '(' : ')';
        rot = theta + Math.PI / 2;
      } else if (opts.char) {
        char = opts.char;
        rot = theta + Math.PI / 2;
      } else {
        const g = asciiFor(theta);
        char = g.char;
        rot = g.rot;
      }
      while (carry <= len) {
        const t = carry / len;
        const f = (walked + carry) / total;
        out.push({
          x: a.x + dx * t,
          y: a.y + dy * t,
          char: char || opts.chars[n % opts.chars.length],
          fg: typeof fg === 'function' ? fg(f) : fg,
          size,
          rot
        });
        n++;
        carry += spacing;
      }
      carry -= len;
      walked += len;
    }
  }

  // Lamina width profiles w(u), u = 0 at the base, 1 at the tip
  const LAMINA = {
    lanceolate: u => Math.pow(Math.sin(Math.PI * u), 0.9) * (1 - 0.3 * u),
    ovate: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.85),
    obovate: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 1.35)), 0.75),
    cordate: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.7),
    linear: u => (u < 0.8 ? 0.9 + 0.1 * Math.sin(u * 4) : Math.max(0, (1 - u) / 0.2)),
    spindle: u => Math.pow(Math.sin(Math.PI * u), 1.1),
    tepal: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.65),
    kidney: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.55)
  };

  /**
   * Draw a lamina (leaf blade, petal, tepal, sepal or bract) with rotated strokes.
   * Local frame: the midrib leaves (x, y) along `angle`; curl bends it sideways.
   * o: { edge, fill, rib, hatch, size, serrate, curl, ribTo, texture, edgeStyle }
   * Outlines are drawn with ( ) brackets, hatching with texture characters.
   */
  function drawLamina(out, x, y, angle, L, W, shape, o = {}) {
    if (L < 1) return;
    const size = o.size || 10;
    const curl = o.curl || 0;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const steps = Math.max(3, Math.ceil(L / (size * 0.55)));
    const point = (u, v) => {
      const along = u * L;
      const side = curl * L * u * u + v;
      return { x: x + ca * along - sa * side, y: y + sa * along + ca * side };
    };
    const w = u => W * shape(u);

    for (const side of [-1, 1]) {
      const edge = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        edge.push(point(u, side * w(u)));
      }
      strokeAlong(out, edge, o.edge, size, o.edgeStyle === 'line' ? {} : { bracket: side });

      // Serrated margin: small teeth angled toward the tip
      if (o.serrate) {
        for (let i = 2; i < steps; i += 3) {
          const u = i / steps;
          const p = point(u, side * w(u) * 1.04);
          out.push({ x: p.x, y: p.y, char: "'", fg: o.edge, size: size * 0.8, rot: angle + side * (Math.PI / 2 - 0.7) + Math.PI / 2 });
        }
      }

      // Hatching follows the blade's shape (fills broad petals with colour)
      for (let k = 1; k <= (o.hatch || 0); k++) {
        const frac = k / ((o.hatch || 0) + 1);
        const line = [];
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          line.push(point(u, side * w(u) * frac));
        }
        strokeAlong(out, line, o.fill || o.edge, size * 0.9, { chars: o.texture || [':', '%', '*'], phase: k * 2 + (side > 0 ? 1 : 0) });
      }
    }

    if (o.rib) {
      const rib = [];
      const ribTo = o.ribTo || 0.9;
      for (let i = 0; i <= steps; i++) rib.push(point((i / steps) * ribTo, 0));
      strokeAlong(out, rib, o.rib, size * 0.85);
    }
  }

  // =========================================================================
  // BOTANICAL PROFILES — real-world shoot & flower traits per species
  // (see docs/BOTANY.md for the study these numbers come from)
  // =========================================================================

  const BOTANY = {
    sunflower: {
      shoot: { straightness: 0.92, kink: 0.02, internode: 30, meander: 0.3, habitAmp: 0.3, flex: 0.55, width: 8, taper: 0.55, texture: 'hairy', nod: 0.5, neck: 8, tint: { hue: 6, sat: -0.12, light: 0.04 } },
      branch: { max: 2, angle: [0.45, 0.8], straightness: 0.85, kink: 0.03, upturn: 0.55, width: 3 },
      leaf: { form: 'cordate', length: 46, width: 0.62, petiole: 0.32, serrate: true, droop: 0.35 }
    },
    hibiscus: {
      shoot: { straightness: 0.7, kink: 0.12, internode: 26, meander: 0.5, habitAmp: 0.7, flex: 0.7, width: 6, taper: 0.45, texture: 'woody', nod: 0.15, neck: 4, tint: { hue: -14, sat: -0.22, light: -0.06 } },
      branch: { max: 3, angle: [0.5, 1.0], straightness: 0.65, kink: 0.14, upturn: 0.35, width: 3 },
      leaf: { form: 'ovate', length: 36, width: 0.5, petiole: 0.18, serrate: true, droop: 0.15 }
    },
    iris: {
      shoot: { straightness: 0.97, kink: 0.01, internode: 60, meander: 0.15, habitAmp: 0.15, flex: 0.6, width: 3, taper: 0.2, texture: 'scape', nod: 0.05, neck: 0, tint: { hue: 28, sat: -0.2, light: 0.02 } },
      branch: { max: 1, angle: [0.35, 0.5], straightness: 0.9, kink: 0.02, upturn: 0.7, width: 2 },
      leaf: { form: 'sword', basal: true }
    },
    thistle: {
      shoot: { straightness: 0.78, kink: 0.07, internode: 18, meander: 0.45, habitAmp: 0.5, flex: 0.65, width: 6, taper: 0.5, texture: 'winged', nod: 0.1, neck: 3, tint: { hue: 4, sat: -0.15, light: 0.05 } },
      branch: { max: 3, angle: [0.35, 0.7], straightness: 0.75, kink: 0.08, upturn: 0.6, width: 2 },
      leaf: { form: 'spinyLobed', length: 40, width: 0.36, petiole: 0, serrate: false, droop: 0.1 }
    },
    marigold: {
      shoot: { straightness: 0.75, kink: 0.1, internode: 16, meander: 0.4, habitAmp: 0.5, flex: 0.8, width: 4, taper: 0.4, texture: 'ridged', nod: 0.05, neck: 2, tint: { hue: -20, sat: -0.08, light: -0.04, mix: 'crimson', mixAmt: 0.22 } },
      branch: { max: 3, angle: [0.55, 1.0], straightness: 0.7, kink: 0.1, upturn: 0.5, width: 2 },
      leaf: { form: 'pinnateFine', length: 34, width: 0.16, petiole: 0.1, serrate: true, droop: 0.1 }
    },
    daffodil: {
      shoot: { straightness: 0.95, kink: 0.0, internode: 80, meander: 0.2, habitAmp: 0.2, flex: 0.9, width: 3, taper: 0.1, texture: 'twoEdged', nod: 0.0, neck: 16, tint: { hue: 18, sat: -0.18, light: 0.0 } },
      branch: { max: 0 },
      leaf: { form: 'strap', basal: true }
    },
    rose: {
      shoot: { straightness: 0.45, kink: 0.22, internode: 22, meander: 0.55, habitAmp: 0.8, flex: 0.6, width: 5, taper: 0.35, texture: 'thorny', nod: 0.1, neck: 3, tint: { hue: -10, sat: -0.05, light: -0.05, mix: 'dark', mixAmt: 0.16 } },
      branch: { max: 3, angle: [0.6, 1.1], straightness: 0.45, kink: 0.24, upturn: 0.1, width: 2 },
      leaf: { form: 'pinnate', length: 40, width: 0.3, petiole: 0.12, serrate: true, droop: 0.1 }
    },
    dandelion: {
      shoot: { straightness: 0.97, kink: 0.0, internode: 100, meander: 0.25, habitAmp: 0.55, flex: 1.35, width: 2.5, taper: 0.1, texture: 'smooth', nod: 0.1, neck: 4, tint: { hue: 10, sat: -0.25, light: 0.1 } },
      branch: { max: 0 },
      leaf: { form: 'rosette', basal: true }
    },
    tulip: {
      shoot: { straightness: 0.96, kink: 0.0, internode: 100, meander: 0.2, habitAmp: 0.35, flex: 0.75, width: 5, taper: 0.15, texture: 'smooth', nod: 0.08, neck: 3, tint: { hue: 24, sat: -0.22, light: 0.02 } },
      branch: { max: 0 },
      leaf: { form: 'broad', basal: true }
    },
    flytrap: {
      shoot: { straightness: 0.95, kink: 0.02, internode: 50, meander: 0.2, habitAmp: 0.2, flex: 1.0, width: 2, taper: 0.2, texture: 'smooth', nod: 0.0, neck: 0, tint: { hue: 0, sat: 0, light: 0.02 } },
      branch: { max: 0 },
      leaf: { form: 'traps', basal: true }
    }
  };

  function botanyOf(type) {
    return BOTANY[type] || BOTANY.sunflower;
  }

  // Young buds are green and colour up as they mature (exact petal colour at full bloom)
  function ripen(col, bloom, palette) {
    return mixColor(palette.stem, col, smoothstep(0.08, 0.45, bloom));
  }

  class Genome {
    constructor(traits = {}) {
      this.species = traits.species || 'sunflower';
      this.seed = traits.seed !== undefined ? traits.seed : 42;
      for (const key in TRAIT_RANGES) {
        const [lo, hi] = TRAIT_RANGES[key];
        const v = traits[key];
        this[key] = (typeof v === 'number' && isFinite(v)) ? clamp(v, lo, hi) : (lo + hi) / 2;
      }
      this.habit = STEM_HABITS.includes(traits.habit) ? traits.habit : 'erect';
      this.noiseSeed = traits.noiseSeed !== undefined ? traits.noiseSeed : this.seed;
      this.generation = traits.generation || 0;
      this._paletteCache = new Map();
    }

    /** A fresh, fully random genome for a species, deterministic for a given seed. */
    static random(species = 'sunflower', seed = 42, overrides = {}) {
      const rng = new PRNG(((seed ^ 0x5bd1e995) >>> 0) || 1);
      const traits = { species, seed };
      for (const key in TRAIT_RANGES) {
        const [lo, hi] = TRAIT_RANGES[key];
        traits[key] = rng.range(lo, hi);
      }
      traits.habit = rng.choice(STEM_HABITS);
      traits.noiseSeed = rng.int();
      return new Genome(Object.assign(traits, overrides));
    }

    /**
     * The species' textbook individual: neutral factors, no colour shift, minimal noise.
     * Used when a garden is created with { variation: false }.
     */
    static canonical(species = 'sunflower', seed = 42, overrides = {}) {
      return new Genome(Object.assign({
        species, seed, habit: 'erect', noiseSeed: seed,
        lifeFactor: 1, vigor: 1, branching: 1, leafing: 1, flowering: 1, size: 1,
        hue: 0, saturation: 0, lightness: 0, growthNoise: 0.08, shapeNoise: 0.5, windSensitivity: 1
      }, overrides));
    }

    static from(value, species, seed) {
      if (value instanceof Genome) return value;
      if (value && typeof value === 'object') return Genome.random(species, seed, value);
      return Genome.random(species, seed);
    }

    /**
     * Offspring genome: every gene drifts by gaussian noise proportional to its range,
     * so lineages evolve gradually instead of jumping to unrelated morphologies.
     */
    mutate(seed, rate = 0.10) {
      const rng = new PRNG(((seed ^ 0x27d4eb2d) >>> 0) || 1);
      const child = {
        species: this.species,
        seed,
        habit: rng.next() < rate * 1.5 ? rng.choice(STEM_HABITS) : this.habit,
        noiseSeed: rng.int(),
        generation: this.generation + 1
      };
      for (const key in TRAIT_RANGES) {
        const [lo, hi] = TRAIT_RANGES[key];
        child[key] = clamp(this[key] + rng.gauss() * (hi - lo) * rate, lo, hi);
      }
      return new Genome(child);
    }

    /**
     * Derive this individual's colours from a base palette. Only the plant's own
     * species and stem colours shift; the palette's colorVariance keeps themed
     * palettes (phosphor, amber, monochrome) on-theme.
     */
    tintPalette(base) {
      const cached = this._paletteCache.get(base.id);
      if (cached) return cached;

      const v = base.colorVariance !== undefined ? base.colorVariance : 1.0;
      if (v <= 0) {
        this._paletteCache.set(base.id, base);
        return base;
      }

      const dHue = this.hue * (SPECIES_HUE_RANGE[this.species] || 15) * v;
      const dSat = this.saturation * 0.12 * v;
      const dLight = this.lightness * 0.07 * v;
      const baseFlowers = base.flowers[this.species] || base.flowers.sunflower;
      const flowers = {};
      for (const key in baseFlowers) {
        flowers[key] = tintColor(baseFlowers[key], dHue, dSat, dLight);
      }

      // Stems vary subtly with vigour: vigorous plants are a deeper, richer green
      // Species stem colour (glaucous iris & tulip, pale dandelion, reddish rose &
      // marigold, woody hibiscus) on top of the individual's vigour and hue genes
      const st = botanyOf(this.species).shoot.tint || {};
      const stemLight = (this.vigor - 1.0) * -0.10 * v + this.lightness * 0.03 * v + (st.light || 0) * v;
      const stemHue = this.hue * 6 * v + (st.hue || 0) * v;
      const stemSat = (st.sat || 0) * v;
      const speciesMix = (c) => (st.mix && baseFlowers[st.mix] ? mixColor(c, baseFlowers[st.mix], (st.mixAmt || 0) * v, 16) : c);
      const tinted = Object.assign({}, base, {
        stem: speciesMix(tintColor(base.stem, stemHue, stemSat, stemLight)),
        stemDark: speciesMix(tintColor(base.stemDark, stemHue, stemSat, stemLight)),
        flowers: Object.assign({}, base.flowers, { [this.species]: flowers })
      });
      this._paletteCache.set(base.id, tinted);
      return tinted;
    }

    toJSON() {
      const out = { species: this.species, seed: this.seed, habit: this.habit, noiseSeed: this.noiseSeed, generation: this.generation };
      for (const key in TRAIT_RANGES) out[key] = Math.round(this[key] * 1000) / 1000;
      return out;
    }
  }

  // =========================================================================
  // 4. GENETIC MORPHOLOGY & BIOLOGICAL GROWTH SIMULATOR
  // =========================================================================

  class BotanicalSimulator {
    constructor(config = {}) {
      this.type = config.type || 'sunflower';
      this.maxHeight = config.height || 360;
      this.scale = config.scale !== undefined ? config.scale : 1.0;
      this.userCurvature = config.curvature !== undefined ? config.curvature : 0.0;
      this.leafDensity = config.leafDensity !== undefined ? config.leafDensity : 1.0;
      this.branchingProp = config.branching !== undefined ? config.branching : 1.0;
      const seed = config.seed !== undefined ? config.seed : 42;
      this.reseedGenetics(seed, Genome.from(config.genome, this.type, seed));
    }

    // Legacy alias used by the Parametric Lab
    get curvature() { return this.userCurvature; }
    set curvature(v) { this.userCurvature = v; }

    /**
     * Re-generate morphology from a seed and a genome (a random genome when omitted).
     * The genome carries the heritable factors (life, branching, leafing, flowering, size,
     * colour, noise); the seed PRNG places individual leaves, branches and timings.
     */
    reseedGenetics(seed, genome = null) {
      this.seed = seed;
      this.genome = genome instanceof Genome ? genome : Genome.random(this.type, seed);
      this.genome.species = this.type;
      this.noise = new SimplexNoise(this.genome.noiseSeed);
      this.clock = 0.0;

      const g = this.genome;
      const rng = new PRNG(this.seed);
      this.rng = rng;
      this.geneticHabit = g.habit;
      this.geneticBendAmp = rng.range(14, 42);
      this.geneticHeightMod = rng.range(0.94, 1.06) * g.size;
      const bp = botanyOf(this.type).branch;
      this.geneticMaxBranches = clamp(Math.round(rng.choice([0, 1, 1, 2, 2, 3]) * g.branching), 0, bp.max !== undefined ? bp.max : 3);
      const [aLo, aHi] = bp.angle || [0.42, 0.9];
      this.geneticBranchAngles = [rng.range(aLo, aHi), rng.range(aLo, aHi), rng.range(aLo, aHi)]
        .map(a => clamp(a * (0.8 + 0.2 * g.branching), 0.3, 1.2));
      this.geneticBranchLengths = [rng.range(0.32, 0.58), rng.range(0.28, 0.52), rng.range(0.24, 0.46)]
        .map(l => l * (0.85 + 0.15 * g.branching));
      this.geneticHeadTilt = rng.range(-0.38, 0.38);
      this.geneticFlowerScaleMod = rng.range(0.85, 1.25) * (0.86 + 0.14 * g.flowering) * Math.sqrt(g.size);
      this.geneticPetalChaos = rng.range(0.68, 1.38) * (0.8 + 0.25 * g.shapeNoise);
      this.geneticLeafClusters = clamp(Math.round(rng.choice([2, 3, 4, 5, 6]) * g.leafing), 2, 6);

      // Foliage Genetic Profiles: randomized placement jitters and individual leaf size variations!
      const leafSizeMod = 0.82 + 0.18 * g.leafing;
      this.geneticLeafJitters = [];
      this.geneticLeafSizes = [];
      this.geneticPhyllotaxis = [];
      for (let i = 0; i < 10; i++) {
        this.geneticLeafJitters.push(rng.range(-0.08, 0.08));
        this.geneticLeafSizes.push([rng.range(0.70, 1.45) * leafSizeMod, rng.range(0.70, 1.45) * leafSizeMod]);
        this.geneticPhyllotaxis.push(rng.choice(['paired', 'paired', 'alternate_l', 'alternate_r']));
      }

      this.initMembers();
    }

    /** Stable per-individual 0..1 value (petal irregularity, facing side, nod direction). */
    variant() {
      return (Math.imul(this.seed | 0, 2654435761) >>> 0) / 4294967296;
    }

    /**
     * Whether a dandelion shows its seed clock (vs. the yellow flower): the head flowers
     * for the first part of its bloom, then closes and reopens as the clock.
     */
    isSeedClock(bloomOverride = null, bloom = 1) {
      if (this.type !== 'dandelion') return false;
      const af = this.members && this.members.apicalFlower;
      if (bloomOverride !== null || !af || af.state === 'dormant') return bloom > 0.35;
      if (af.state === 'blooming') return af.age > af.lifespan * 0.45;
      return af.state === 'wilting';
    }

    /** Swap in an edited genome while keeping the seed-driven placement. */
    applyGenome(genome) {
      this.reseedGenetics(this.seed, Genome.from(genome, this.type, this.seed));
    }

    /**
     * Smooth growth-velocity multiplier from noise, always > 0, so growth timing wanders
     * between individuals and over time without ever running backwards.
     */
    growthNoise(t) {
      return 1.0 + this.genome.growthNoise * this.noise.fbm1(t * 0.12 + 3.7, 2) * 1.6;
    }

    /**
     * Initialize Persistent Member Graph:
     * Individual lifecycles and subcycles for leaves, apical flower, and axillary branches.
     */
    initMembers() {
      const rng = new PRNG(this.seed);
      const g = this.genome;
      const life = g.lifeFactor;
      this.members = {
        leaves: [],
        branches: [],
        apicalFlower: {
          state: 'dormant', // dormant, bud, opening, blooming, wilting, dead
          bloom: 0.0,
          age: 0.0,
          lifespan: rng.range(28, 45) * life * (0.8 + 0.2 * g.flowering), // peak anthesis
          wiltTimer: 11.0,            // 11s of visible wilting and petal shedding
          resproutTimer: 8.0,          // 8s resting calyx before next flush
          cycleCount: 0,
          vigor: rng.range(0.8, 1.2)
        }
      };
      this.seedRelease = 0; // flowers that finished and set seed since the garden last looked

      // 1. Main Stem Leaf Members with Staggered Lifespans (Turnover occurs throughout mature life!)
      const numClusters = Math.min(6, Math.floor(this.geneticLeafClusters * this.leafDensity));
      const leafLifespanBase = [16, 24, 19, 29, 22, 34];
      const makeLeaf = (c, side, ratio, yOffset, sizeMod, allometry, lifespan) => ({
        id: `leaf_${c}_${side < 0 ? 'l' : 'r'}`,
        cluster: c,
        yRatio: ratio,
        yOffset,
        side,
        scaleMod: sizeMod,
        baseScale: sizeMod * allometry,
        scale: sizeMod * allometry * 0.08,
        maturity: 0.08,
        state: 'dormant',
        age: 0.0,
        lifespan,
        wiltTimer: 9.0,
        resproutTimer: rng.range(6, 12),
        isWilted: false,
        isDead: false,
        // Individual emergence speed and a coherent-noise tilt so no two leaves sit alike
        vigor: rng.range(0.75, 1.3),
        tilt: this.noise.noise2(c * 1.37, side * 2.11) * 0.32 * g.shapeNoise
      });

      for (let c = 1; c <= numClusters; c++) {
        const baseRatio = c / (numClusters + 1);
        const jitter = this.geneticLeafJitters[c % this.geneticLeafJitters.length];
        const clampedRatio = clamp(baseRatio + jitter, 0.12, 0.88);
        const phyllo = this.geneticPhyllotaxis[c % this.geneticPhyllotaxis.length];
        const sizePair = this.geneticLeafSizes[c % this.geneticLeafSizes.length];
        const allometry = 0.72 + 0.55 * Math.sin(clampedRatio * Math.PI);
        const baseLifespan = ((leafLifespanBase[c % leafLifespanBase.length] || 22) + rng.range(-3, 3)) * life;

        if (phyllo === 'paired') {
          const yOffsetR = 2 + Math.floor(((this.seed * 3 + c * 5) % 5));
          this.members.leaves.push(makeLeaf(c, -1, clampedRatio, 0, sizePair[0], allometry, baseLifespan * rng.range(0.85, 1.15)));
          this.members.leaves.push(makeLeaf(c, 1, clampedRatio, yOffsetR, sizePair[1], allometry, baseLifespan * rng.range(0.85, 1.15)));
        } else if (phyllo === 'alternate_l') {
          this.members.leaves.push(makeLeaf(c, -1, clampedRatio, 0, sizePair[0], allometry, baseLifespan));
        } else {
          this.members.leaves.push(makeLeaf(c, 1, clampedRatio, 0, sizePair[1], allometry, baseLifespan));
        }
      }

      // 2. Secondary Branches (with child leaves and child flowers)
      const branchMax = Math.min(this.geneticMaxBranches, Math.floor(this.branchingProp * 3));
      const initialSide = ((this.seed % 2) === 0) ? -1 : 1;
      const fertility = clamp(0.35 + 0.5 * g.flowering, 0, 1);

      for (let bi = 0; bi < branchMax; bi++) {
        const branchSide = (bi % 2 === 0) ? initialSide : -initialSide;
        const startYRatio = 0.30 + bi * 0.22;
        const bLenRatio = this.geneticBranchLengths[bi % this.geneticBranchLengths.length] || 0.4;
        const bAngle = this.geneticBranchAngles[bi % this.geneticBranchAngles.length] || 0.65;

        // Child leaves on this branch
        const branchLeaves = [0.45, 0.80].map((posAlong, li) => ({
          id: `br_leaf_${bi}_${li}`,
          posAlong,
          side: li === 0 ? -branchSide : branchSide,
          scale: (li === 0 ? 0.75 : 0.65) * (0.85 + 0.15 * g.leafing),
          state: 'dormant',
          age: 0.0,
          lifespan: rng.range(50, 90) * life,
          wiltTimer: 16.0,
          resproutTimer: rng.range(20, 35)
        }));

        // Child flower at branch tip (a sterile shoot never buds)
        const branchFlower = {
          id: `br_flower_${bi}`,
          state: 'dormant',
          bloom: 0.0,
          age: 0.0,
          lifespan: rng.range(70, 130) * life,
          resproutTimer: rng.range(25, 45),
          isDead: false,
          sterile: rng.next() > fertility
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
          flower: branchFlower,
          wiggle: rng.range(0, 100)
        });
      }
    }

    /**
     * Advance Member Subcycles over time (leaves, flowers, and branches with dependency rules)
     */
    updateMembers(dt, timeSpeed = 1.0, globalAge = 0.0) {
      // memberCycles = false: leaves & flowers mature and then stay (no wilting, no seed heads)
      const cycles = this.memberCycles !== false;
      if (!this.members) this.initMembers();
      const effectiveDt = dt * timeSpeed;
      this.clock += effectiveDt;
      const g = this.genome;
      const noise = this.noise;
      const clock = this.clock;
      const rng = this.rng;
      const effectiveMaxHeight = this.maxHeight * this.geneticHeightMod;
      const growthFactor = (1 - Math.exp(-4 * Math.min(1.0, globalAge))) / (1 - Math.exp(-4));
      const senescence = (globalAge > 21.0) ? clamp((globalAge - 21.0) / 2.5, 0.0, 1.0) : 0.0;
      let shootHeight = Math.max(20, effectiveMaxHeight * growthFactor);
      if (senescence > 0) shootHeight = Math.max(16, shootHeight * (1.0 - senescence * 0.22));

      // 1. UPDATE MAIN STEM LEAVES (Active turnover during mature prime!)
      this.members.leaves.forEach((l, li) => {
        const nodeTargetY = l.yRatio * (effectiveMaxHeight * 0.88);
        const apexDist = shootHeight - nodeTargetY;
        // Per-leaf emergence speed wanders smoothly with noise (never negative)
        const leafRate = (l.vigor || 1.0) * Math.max(0.25, 1.0 + g.growthNoise * 2.2 * noise.noise2(li * 3.1, clock * 0.15));

        if (apexDist >= 0) {
          if (l.state === 'dormant') {
            // Start from the size the leaf already has at this height (continuous with the
            // static view), so a plant added fully grown does not shrink back to buds
            l.state = 'bud';
            l.maturity = clamp((apexDist - 2) / 48, 0.08, 1.0);
            l.age = 0.0;
            l.isDead = false;
            l.isWilted = false;
          }

          if (l.state === 'bud' || l.state === 'growing') {
            l.maturity = Math.min(1.0, l.maturity + effectiveDt * 0.15 * leafRate);
            if (l.maturity >= 1.0) {
              l.state = 'mature';
            }
          }

          if (l.state === 'mature') {
            l.age += effectiveDt;
            if ((cycles && l.age >= l.lifespan) || senescence > 0.15) {
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
              l.lifespan = (20.0 + rng.next() * 15.0) * g.lifeFactor;
            }
          }
        }
      });

      // 2. UPDATE APICAL FLOWER (Successive Blooming Waves throughout mature prime!)
      const af = this.members.apicalFlower;
      if (globalAge > 0.42 && senescence < 0.92) {
        if (af.state === 'dormant') {
          // A seedling's flower starts as a bud; a plant added already mature starts in the
          // bloom its age implies (same curve as the static view)
          const start = Math.max(0.10, smoothstep(0.42, 0.88, Math.min(1, globalAge)));
          af.bloom = start;
          af.state = start >= 0.92 ? 'blooming' : (start >= 0.38 ? 'opening' : 'bud');
          af.age = 0.0;
        }

        const bloomRate = (af.vigor || 1.0) * Math.max(0.3, 1.0 + g.growthNoise * 2.0 * noise.noise2(91.7, clock * 0.11));
        if (af.state === 'bud') {
          af.bloom = Math.min(0.40, af.bloom + effectiveDt * 0.08 * bloomRate);
          if (af.bloom >= 0.38) af.state = 'opening';
        } else if (af.state === 'opening') {
          af.bloom = Math.min(1.0, af.bloom + effectiveDt * 0.10 * bloomRate);
          if (af.bloom >= 0.92) af.state = 'blooming';
        } else if (af.state === 'blooming') {
          af.age += effectiveDt;
          if ((cycles && af.age >= af.lifespan) || senescence > 0.15) {
            af.state = 'wilting';
            af.wiltTimer = 11.0;
          }
        } else if (af.state === 'wilting') {
          af.wiltTimer -= effectiveDt;
          af.bloom = Math.max(0.12, af.bloom - effectiveDt * 0.08);
          if (af.wiltTimer <= 0 || af.bloom <= 0.14) {
            // The spent head sets seed and holds it while it dries
            af.state = 'seedhead';
            af.bloom = 0.0;
            af.seedDuration = 8.0 + 6.0 * g.flowering;
            af.seedTimer = af.seedDuration;
            af.seedsDropped = 0;
          }
        } else if (af.state === 'seedhead') {
          af.seedTimer -= effectiveDt;
          const progress = 1 - af.seedTimer / af.seedDuration;
          // Seeds fall in three waves as the head dries out
          while (af.seedsDropped < 3 && progress >= (af.seedsDropped + 1) / 3) {
            af.seedsDropped++;
            this.seedRelease++;
          }
          if (af.seedTimer <= 0) {
            af.state = 'dead';
            af.resproutTimer = 8.0;
          }
        } else if (af.state === 'dead' && senescence < 0.85) {
          af.resproutTimer -= effectiveDt;
          if (af.resproutTimer <= 0) {
            af.state = 'bud';
            af.bloom = 0.10;
            af.age = 0.0;
            af.cycleCount++;
            af.lifespan = (28.0 + rng.next() * 16.0) * g.lifeFactor * (0.8 + 0.2 * g.flowering);
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
            const grown = clamp((Math.min(1, globalAge) - 0.48) / 0.45, 0, 1);
            b.currentLength = Math.max(4.0, shootHeight * b.lengthRatio * grown * (1.0 - senescence * 0.35));
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
              if ((cycles && bl.age >= bl.lifespan) || senescence > 0.15) {
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
          if (bf.state === 'dormant' && !bf.sterile && b.currentLength >= targetLen * 0.85) {
            bf.state = 'bud';
            bf.bloom = 0.15;
            bf.age = 0.0;
          }
          if (bf.state === 'bud' || bf.state === 'opening') {
            bf.bloom = Math.min(1.0, bf.bloom + effectiveDt * 0.05);
            if (bf.bloom >= 0.85) bf.state = 'blooming';
          } else if (bf.state === 'blooming') {
            bf.age += effectiveDt;
            if ((cycles && bf.age >= bf.lifespan) || senescence > 0.15) {
              bf.state = 'wilting';
            }
          } else if (bf.state === 'wilting') {
            bf.bloom = Math.max(0.0, bf.bloom - effectiveDt * 0.04);
            if (bf.bloom <= 0.05) {
              bf.state = 'dead';
              bf.isDead = true;
              bf.resproutTimer = 35.0;
              this.seedRelease++;
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
              if (rng.next() < (0.06 * effectiveDt) || b.deathTimer > 30.0) {
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
      // A fed flower re-opens from a half-open bud over a few seconds (no snapping)
      const af = this.members.apicalFlower;
      if (af.state === 'wilting' || af.state === 'seedhead' || af.state === 'dead') {
        af.state = 'opening';
        af.bloom = Math.max(af.bloom, 0.45);
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
        if (b.flower && !b.flower.sterile && (b.flower.state === 'wilting' || b.flower.state === 'dead')) {
          b.flower.state = 'opening';
          b.flower.bloom = Math.max(b.flower.bloom, 0.45);
          b.flower.isDead = false;
        }
      });
    }

    /**
     * Pure snapshot of the plant's geometry at a given biological age.
     * gust in [-1, 1] is the local wind-field value (see WindField).
     */
    simulate(age = 1.0, bloomOverride = null, time = 0, windStrength = 0.5, pointerDist = null, gust = 0) {
      age = Math.max(0.02, age);
      const g = this.genome;
      const noise = this.noise;
      const flex = g.windSensitivity;
      const growthAge = Math.min(1.0, age);
      // Mature prime life plateau: stays at full height for at least 20n (1.0 <= age <= 21.0)!
      const senescence = (age > 21.0) ? clamp((age - 21.0) / 2.5, 0.0, 1.0) : 0.0;

      const effectiveMaxHeight = this.maxHeight * this.geneticHeightMod;
      const growthFactor = (1 - Math.exp(-4 * growthAge)) / (1 - Math.exp(-4));
      let shootHeight = Math.max(20, effectiveMaxHeight * growthFactor);
      if (senescence > 0) {
        shootHeight = Math.max(16, shootHeight * (1.0 - senescence * 0.22));
      }

      // 1. Stem spine, integrated upward from the base in fixed steps and keyed to absolute
      //    height (grown tissue keeps its shape while the apex extends). The species
      //    profile decides how straight, node-kinked (zigzag), jagged and sinuous it is.
      const sh = botanyOf(this.type).shoot;
      const STEP = 8;
      const nSeg = Math.max(6, Math.ceil(shootHeight / STEP));
      const stemNodes = [];
      const dirMult = this.geneticHabit.includes('left') ? -1 : 1;
      const kinkSign = (this.seed & 1) ? 1 : -1;
      const nodDir = this.variant() < 0.5 ? -1 : 1;
      const response = 0.35 + 0.65 * (1 - sh.straightness);
      const neckAmt = (sh.neck || 0) * smoothstep(0.45, 1.0, growthAge);
      let heading = 0;
      let sx = 0;
      let prevY = 0;

      for (let i = 0; i <= nSeg; i++) {
        const y = Math.min(i * STEP, shootHeight);
        const t = y / shootHeight;
        if (i > 0) {
          const node = Math.floor(y / sh.internode);
          const zig = sh.kink * (0.6 + 0.8 * hash01(this.seed, node)) * (node % 2 === 0 ? 1 : -1) * kinkSign;
          const jag = noise.noise2(y / 13, 9.1) * (1 - sh.straightness) * 0.45 * g.shapeNoise;
          const meander = noise.fbm2(y / 85, 4.2, 2) * sh.meander * 0.3 * g.shapeNoise;
          // Straight species ease toward the new direction; jagged ones snap to it at nodes
          heading = lerp(heading, zig + jag + meander, response);
          sx += Math.sin(heading) * (y - prevY);
        }
        prevY = y;

        // Genome habit, expressed only as far as the species allows
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
        dx *= sh.habitAmp;
        dx += Math.sin(t * Math.PI * 0.9) * (this.userCurvature * 45);

        // Swan neck / nodding: the top of the stalk bends toward the flower's facing side
        if (neckAmt > 0 && t > 0.82) dx += nodDir * neckAmt * Math.pow((t - 0.82) / 0.18, 2);

        // Turgor loss during senescence causes stem to bow/droop with gravity
        if (senescence > 0) {
          dx += (this.seed % 2 === 0 ? 1 : -1) * Math.sin(t * Math.PI) * (24 * senescence * t);
        }

        // Harmonic sway modulated by travelling gusts, plus a fine per-plant flutter;
        // hollow scapes (dandelion) bend far more than woody canes or stout stalks
        const bend = windStrength * 16 * Math.pow(t, 1.4) * flex * sh.flex;
        const windWave = (Math.sin(time * 2.2 + t * 2.5) * (0.65 + 0.35 * Math.abs(gust)) + gust * 0.9) * bend
          + noise.noise2(time * 0.9, t * 1.7) * bend * 0.25;

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

        stemNodes.push({ x: sx + dx + windWave + pointerDeflection, y, t, angle: 0 });
      }

      // Tangent of the stem at every node: clockwise lean from vertical, used to rotate glyphs
      for (let i = 0; i < stemNodes.length; i++) {
        const a = stemNodes[Math.max(0, i - 1)];
        const b = stemNodes[Math.min(stemNodes.length - 1, i + 1)];
        stemNodes[i].angle = Math.atan2(b.x - a.x, Math.max(1e-3, b.y - a.y));
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
              state: l.state,
              tilt: l.tilt || 0
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
        const afm = this.members.apicalFlower;
        // A wilting flower does not close back into a bud: it keeps its open shape
        // and the wilt effect sheds, droops and fades it instead
        bloom = afm.state === 'wilting' ? Math.max(afm.bloom, 0.92) : afm.bloom;
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

      // Two different things wilt and they must not be confused:
      //  - a flower head finishing its bloom (many times per life, local to that head)
      //  - the whole plant ageing at the end of its life (senescence)
      const af = this.members && this.members.apicalFlower;
      const flowerWilting = !!(af && af.state === 'wilting');
      // 0 = fresh bloom, 1 = fully spent; drives the yellowing of the flower stalk only
      let flowerSpent = 0;
      if (af && af.state === 'wilting') flowerSpent = clamp(1 - af.wiltTimer / 11.0, 0, 1);
      else if (af && af.state === 'seedhead') flowerSpent = 1;
      else if (af && af.state === 'dead') flowerSpent = clamp(af.resproutTimer / 8.0, 0, 1);
      const isWilting = senescence > 0.15;

      // Visible ageing follows the genome: long-lived, vigorous plants brown later & slower
      const browningRate = clamp(1.45 - 0.45 * g.lifeFactor - 0.4 * (g.vigor - 1.0), 0.6, 1.4);
      const ageing = clamp(senescence * browningRate, 0, 1);
      // How wilted the main flower head looks (0..1): its own wilt, or old age
      const flowerWilt = Math.max(flowerWilting ? flowerSpent : 0, smoothstep(0.1, 0.8, ageing));
      const seedProgress = (af && af.state === 'seedhead') ? clamp(1 - af.seedTimer / af.seedDuration, 0, 1) : 0;

      return {
        type: this.type,
        scale: this.scale || 1.0,
        age,
        growthAge,
        senescence,
        isWilting,
        flowerWilting,
        flowerSpent,
        flowerWilt,
        flowerPhase: af ? af.state : 'dormant',
        seedProgress,
        ageing,
        isDecaying: (senescence >= 0.88),
        bloom,
        isBud,
        shootHeight,
        stemNodes,
        leaves,
        branches,
        flowerScale,
        // Mature heads nod (sunflowers strongly); senescent ones droop further
        headTilt: this.geneticHeadTilt * 0.6 + nodDir * sh.nod * smoothstep(0.6, 1.0, growthAge) * (af && af.state === 'seedhead' ? 1.4 : 1.0)
          + (senescence * 0.45 * (this.seed % 2 === 0 ? 1 : -1)),
        dandelionClock: this.isSeedClock(bloomOverride, bloom),
        petalChaos: this.geneticPetalChaos,
        activeLeafCount: activeLeaves.length,
        branchCount: branches.length,
        // Flower heads nod with the stem tip and the gusts
        windLean: clamp((stemNodes[stemNodes.length - 1].angle || 0) * 0.6, -0.45, 0.45),
        leafFlutter: windStrength * flex * (0.08 * Math.sin(time * 3.1) + 0.12 * gust),
        windStrength,
        shapeNoise: g.shapeNoise,
        variant: this.variant(),
        noise,
        time
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
      const nodes = pData.stemNodes;
      const shootH = pData.shootHeight;
      const leaves = pData.leaves;
      const branches = pData.branches;
      const fScale = pData.flowerScale;
      const bloom = pData.bloom;
      const age = pData.age;
      const pScale = pData.scale || 1.0;

      // Tissue is drawn in healthy colours; ageing is applied per height at the end
      const cStem = palette.stem;
      const cStemDark = palette.stemDark;
      const cWilted = palette.wilted;
      const cDead = palette.dead;
      const sen = pData.senescence || 0;

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
      // 1. SHOOT (SPECIES PROFILE: THICKNESS, TAPER, SURFACE TEXTURE)
      // -------------------------------------------------------------
      const bot = botanyOf(pType);
      const flutter = pData.leafFlutter || 0;
      const growthAge = pData.growthAge !== undefined ? pData.growthAge : Math.min(1.0, age);
      const fPal = palette.flowers[pType] || palette.flowers.sunflower;
      const nodeAt = y => {
        const t = y / Math.max(1, shootH);
        return nodes[Math.min(nodes.length - 1, Math.max(0, Math.floor(t * (nodes.length - 1))))];
      };

      BotanicalArchitect._drawShoot(glyphs, nodes, originX, groundY, shootH, bot.shoot, palette, fPal, seed, pScale);

      // -------------------------------------------------------------
      // 2. FOLIAGE (SPECIES LEAF FORM)
      // -------------------------------------------------------------
      if (pType === 'iris') {
        // Fan of flat, sword-shaped (ensiform) blades: two strands that taper to a point,
        // leaning gently outward and swaying with the wind
        const bladeHeights = [0.55, 0.72, 0.85, 0.62, 0.48].map(h => h * shootH * (0.3 + 0.7 * growthAge));
        const bladeLean = [-0.30, -0.14, 0.04, 0.18, 0.34];
        bladeHeights.forEach((bh, bIdx) => {
          const steps = Math.max(3, Math.floor(bh / 9));
          const lean = bladeLean[bIdx] * (1.0 + 0.8 * sen);
          const sway = flutter * 28 + (pData.noise ? pData.noise.noise2(bIdx * 4.3, time * 0.5) * 5 * Math.min(1, pData.windStrength || 0) : 0);
          const baseX = originX + bladeLean[bIdx] * 18;
          let prevX = baseX;
          let prevY = groundY;
          for (let st = 1; st <= steps; st++) {
            const u = st / steps;
            const px = baseX + Math.sin(lean) * bh * u + lean * 14 * u * u + sway * u * u;
            const py = groundY - bh * u + u * u * bh * 0.25 * sen;
            const rot = Math.atan2(px - prevX, Math.max(0.5, prevY - py));
            const w = 2.6 * (1 - u * 0.75);
            const ca = Math.cos(rot);
            const sa = Math.sin(rot);
            const col = u < 0.7 ? cStem : cStemDark;
            const gl = stemGlyph(rot);
            glyphs.push({ x: px - ca * w, y: py - sa * w, char: gl.char, fg: col, size: 13, rot: gl.rot });
            if (u < 0.92) glyphs.push({ x: px + ca * w, y: py + sa * w, char: gl.char, fg: cStemDark, size: 13, rot: gl.rot });
            prevX = px;
            prevY = py;
          }
        });
      } else if (pType === 'dandelion') {
        // Basal rosette of runcinate ("lion's tooth") leaves lying low over the soil.
        // Sized by growth age (0..1), never by total lifespan.
        const numLeaves = 6 + (seed % 3);
        const leafCol = sen > 0.15 ? cWilted : cStem;
        const toothCol = sen > 0.15 ? cDead : cStemDark;
        for (let i = 0; i < numLeaves; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const rank = Math.floor(i / 2);
          const elev = 0.18 + rank * 0.16 + (((seed * (i + 1) * 7) % 11) - 5) * 0.015 - sen * 0.2;
          const leafScale = 0.75 + (((seed * (i + 3) * 13) % 17) / 17) * 0.45;
          const leafLen = (34 + 22 * Math.cos(rank * 0.9)) * leafScale * (0.25 + 0.75 * growthAge);
          const theta = side < 0 ? Math.PI + elev : -elev;
          const dirX = Math.cos(theta);
          const dirY = Math.sin(theta);
          for (let d = 6; d <= leafLen; d += 7) {
            const u = d / leafLen;
            const droop = u * u * (5 + sen * 10) - flutter * 20 * u;
            const mx = originX + dirX * d;
            const my = groundY - 2 + dirY * d + droop;
            glyphs.push({ x: mx, y: my, char: "-", fg: leafCol, size: 12, rot: theta });
            const lobe = Math.sin(u * Math.PI) * 5 * leafScale;
            if (lobe > 1.5 && (d / 7) % 2 < 1) {
              const up = ((d / 7) % 4) < 2 ? -1 : 1;
              glyphs.push({
                x: mx - dirY * lobe * up,
                y: my + dirX * lobe * up,
                char: side < 0 ? ">" : "<",
                fg: toothCol,
                size: Math.max(9, Math.round(10 * leafScale)),
                rot: side < 0 ? elev : -elev
              });
            }
          }
        }
      } else if (pType === 'daffodil') {
        // Flat strap leaves rising from the bulb and arching outward under their own weight
        [-1, -1, 1, 1].forEach((side, li) => {
          const leafH = shootH * (li % 2 === 0 ? 0.62 : 0.48) * (0.3 + 0.7 * growthAge);
          const spread = (li % 2 === 0 ? 30 : 46) * (1.0 + 0.6 * sen);
          const steps = Math.max(3, Math.floor(leafH / 9));
          let prevX = originX + side * 5;
          let prevY = groundY;
          for (let st = 1; st <= steps; st++) {
            const u = st / steps;
            const px = originX + side * (5 + spread * u * u) + flutter * 30 * u * u;
            const py = groundY - leafH * Math.sin(u * Math.PI * 0.42) / Math.sin(Math.PI * 0.42) + u * u * leafH * 0.35 * sen;
            const rot = Math.atan2(px - prevX, prevY - py);
            const ca = Math.cos(rot);
            const sa = Math.sin(rot);
            const w = 2.2 * (1 - u * 0.6);
            const gl = stemGlyph(rot);
            glyphs.push({ x: px - ca * w, y: py - sa * w, char: gl.char, fg: cStem, size: 13, rot: gl.rot });
            glyphs.push({ x: px + ca * w, y: py + sa * w, char: side < 0 ? '(' : ')', fg: cStemDark, size: 13, rot });
            prevX = px;
            prevY = py;
          }
        });
      } else if (pType === 'tulip') {
        // Two or three broad, glaucous, wavy-edged leaves clasping the stem base and arching out
        const n = 2 + (seed % 2);
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const L = shootH * (0.42 + 0.1 * i) * (0.3 + 0.7 * growthAge);
          const ang = -Math.PI / 2 + side * (0.2 + 0.16 * i) + flutter * 0.6;
          drawLamina(glyphs, originX + side * 3, groundY, ang, L, L * 0.12,
            u => LAMINA.lanceolate(u) * (1 + 0.07 * Math.sin(u * 22)),
            { edge: cStem, fill: cStemDark, hatch: 1, texture: [':', ';'], rib: cStemDark, size: 11, curl: side * (0.3 + 0.3 * sen) });
        }
      } else if (pType === 'flytrap') {
        // Rosette of traps: a winged, heart-shaped petiole ending in two hinged lobes,
        // red inside, rimmed with long marginal cilia
        const nTraps = 5 + (seed % 3);
        for (let i = 0; i < nTraps; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const rank = Math.floor(i / 2);
          const k = 1.5 * (0.35 + 0.65 * growthAge) * (0.8 + 0.4 * hash01(seed, i));
          const elev = 0.1 + rank * 0.24 + (hash01(seed + 3, i) - 0.5) * 0.15;
          const ang = (side < 0 ? Math.PI + elev : -elev) + flutter * 0.5;
          const Lp = (14 + 7 * rank) * k;
          const px = originX + side * 2;
          const py = groundY - 2;
          drawLamina(glyphs, px, py, ang, Lp, 3.2 * k, LAMINA.obovate, { edge: cStem, fill: cStemDark, hatch: 1, size: 9 });
          const tx = px + Math.cos(ang) * Lp;
          const ty = py + Math.sin(ang) * Lp;
          const closed = hash01(seed + 11, i) < 0.2;
          const gape = closed ? 0.06 : 0.42;
          const Lt = 13 * k;
          const Wt = 6.5 * k;
          for (const lobe of [-1, 1]) {
            const la = ang + lobe * gape;
            const curl = lobe * 0.12;
            drawLamina(glyphs, tx, ty, la, Lt, Wt, LAMINA.kidney, { edge: fPal.jaw, fill: fPal.inside, hatch: closed ? 0 : 2, texture: ['@', '%', '#', '&'], size: 9, curl });
            const ca = Math.cos(la);
            const sa = Math.sin(la);
            for (let c = 1; c <= 6; c++) {
              const u = c / 7;
              const along = u * Lt;
              const off = curl * Lt * u * u + lobe * Wt * LAMINA.kidney(u);
              const mx = tx + ca * along - sa * off;
              const my = ty + sa * along + ca * off;
              const dir = la + lobe * (Math.PI / 2 - 0.35);
              strokeAlong(glyphs, [{ x: mx, y: my }, { x: mx + Math.cos(dir) * 6 * k, y: my + Math.sin(dir) * 6 * k }], fPal.teeth, 8);
            }
          }
        }
      } else {
        // Leafy stems: each leaf drawn in its species' form from its node
        leaves.forEach(leaf => {
          const n = nodeAt(leaf.y);
          const ca = Math.cos(n.angle);
          const half = Math.max(1, bot.shoot.width * (1 - bot.shoot.taper * (leaf.y / Math.max(1, shootH)))) * 0.5;
          const bx = originX + n.x + ca * half * leaf.side;
          const by = groundY - leaf.y + Math.sin(n.angle) * half * leaf.side;
          const mat = leaf.maturity !== undefined ? leaf.maturity : 1.0;
          const baseScale = (leaf.scale || 1.0) / Math.max(0.08, mat);
          BotanicalArchitect._stemLeaf(glyphs, bot.leaf, bx, by, leaf.side, baseScale, mat, leaf.isWilted, leaf.tilt || 0, flutter, palette);
        });
      }

      // -------------------------------------------------------------
      // 3. SECONDARY BRANCHES (SPECIES BRANCH HABIT, CHILD LEAVES, TIP FLOWERS)
      // -------------------------------------------------------------
      const bp = bot.branch;
      branches.forEach(b => {
        const n0 = nodeAt(b.startY);
        const bx0 = originX + n0.x;
        const by0 = groundY - b.startY;
        const isWithering = (b.state === 'withering' || (b.health !== undefined && b.health < 0.35));
        const brCol = isWithering ? cDead : cStem;
        const straight = bp.straightness !== undefined ? bp.straightness : 0.8;
        const resp = 0.3 + 0.7 * (1 - straight);
        const STEP = 7;

        // Integrate the branch spine: it leaves at its angle, then curves up (or arches
        // out) by the species' up-turn, with node kinks and jaggedness like the stem
        const pts = [{ x: bx0, y: by0, a: b.side * b.angle }];
        let heading = b.side * b.angle;
        let x = bx0;
        let y = by0;
        for (let d = STEP; d <= b.length; d += STEP) {
          const u = d / Math.max(1, b.length);
          const node = Math.floor(d / Math.max(8, bot.shoot.internode * 0.8));
          const zig = (bp.kink || 0) * (node % 2 ? 1 : -1) * (0.6 + 0.8 * hash01(seed + b.index * 31, node));
          const jag = pData.noise ? pData.noise.noise2(d / 12, b.wiggle || 0) * (1 - straight) * 0.5 : 0;
          const sag = isWithering ? b.side * 1.1 * (1 - (b.health || 0)) * u : 0;
          const target = b.side * b.angle * (1 - (bp.upturn || 0) * u) + zig + jag + flutter * 1.2 * u + sag;
          heading = lerp(heading, target, resp);
          x += Math.sin(heading) * STEP;
          y -= Math.cos(heading) * STEP;
          pts.push({ x, y, a: heading });
        }

        const strands = (bp.width || 2) >= 3 ? 2 : 1;
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          const ca = Math.cos(p.a);
          const sa = Math.sin(p.a);
          for (let k = 0; k < strands; k++) {
            const off = strands === 1 ? 0 : (k - 0.5) * 2.4;
            const gl = stemGlyph(p.a);
            glyphs.push({ x: p.x + ca * off, y: p.y + sa * off, char: gl.char, fg: isWithering ? mixColor(cWilted, cDead, i / pts.length) : (k === 1 ? cStemDark : brCol), size: 12, rot: gl.rot });
          }
          if (bot.shoot.texture === 'thorny' && i % 3 === 0) {
            const sd = i % 6 === 0 ? -1 : 1;
            glyphs.push({ x: p.x + ca * sd * 3, y: p.y + sa * sd * 3, char: sd < 0 ? '<' : '>', fg: mixColor(cStemDark, fPal.dark || cStemDark, 0.55), size: 10, rot: p.a + sd * 0.35 });
          }
        }

        const at = f => pts[Math.min(pts.length - 1, Math.max(0, Math.round(f * (pts.length - 1))))];

        // Child leaves on this branch (same form as the stem leaves, smaller)
        if (b.leaves && b.leaves.length > 0 && !bot.leaf.basal) {
          b.leaves.forEach(bl => {
            if (bl.state === 'dormant' || bl.state === 'dead') return;
            const p = at(bl.posAlong || 0.5);
            const wilted = (bl.state === 'wilting' || isWithering);
            BotanicalArchitect._stemLeaf(glyphs, bot.leaf, p.x, p.y, bl.side, (bl.scale || 0.7) * 0.75, 1.0, wilted, 0, flutter, palette);
          });
        }

        // Child flower at branch tip
        const bFlower = b.flower;
        let bBloom = (bFlower && bFlower.state !== 'dormant' && !bFlower.isDead) ? bFlower.bloom : (b.hasFlower ? bloom * 0.8 : 0);
        if (bFlower && bFlower.state === 'wilting') bBloom = Math.max(bBloom, 0.85);
        if (bBloom > 0.15) {
          const tip = pts[pts.length - 1];
          const ownWilt = (bFlower && bFlower.state === 'wilting') ? clamp(1 - bFlower.bloom / 0.85, 0, 1) : 0;
          const secFlower = ProceduralFlowerRenderer.generateGlyphs(
            pType, tip.x, tip.y, fScale * 0.65, bBloom, palette, time, false,
            Math.max(ownWilt, isWithering ? 0.8 : 0, smoothstep(0.1, 0.8, pData.ageing || 0)),
            tip.a * 0.5 + (pData.windLean || 0), pData.variant
          );
          BotanicalArchitect._peduncle(glyphs, secFlower, tip.x, tip.y, tip.a, tip.x, fScale * 0.65, palette);
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

      const apexAngle = nodes[nodes.length - 1].angle || 0;
      if (pData.flowerPhase === 'seedhead') {
        const seedHead = ProceduralFlowerRenderer.generateSeedHead(
          pType, tiltX, tiltY, fScale, palette, pData.seedProgress, tilt * 0.5 + (pData.windLean || 0), pData.variant
        );
        BotanicalArchitect._peduncle(glyphs, seedHead, apexX, apexY, apexAngle, tiltX, fScale, palette);
        glyphs.push(...seedHead);
      } else if (pData.isBud) {
        const flowerGlyphs = ProceduralFlowerRenderer.generateGlyphs(
          pType, tiltX, tiltY, fScale, bloom, palette, time, seedsBlown, pData.flowerWilt || 0,
          tilt * 0.5 + (pData.windLean || 0), pData.variant, { clock: pData.dandelionClock }
        );
        BotanicalArchitect._peduncle(glyphs, flowerGlyphs, apexX, apexY, apexAngle, tiltX, fScale, palette);
        glyphs.push(...flowerGlyphs);
      }

      BotanicalArchitect._applyAgeing(glyphs, pData, groundY, palette);
      return glyphs;
    }

    /**
     * Stem drawn from the species shoot profile: 1-3 tangent-aligned strands (thickness
     * and taper), then the surface texture — hairs, hooked prickles, spiny wings,
     * woody bark with node scars, ridged nodes, two-edged scape or sheathing spathes.
     */
    static _drawShoot(glyphs, nodes, originX, groundY, shootH, sh, palette, fPal, seed, pScale = 1.0) {
      const cStem = palette.stem;
      const cDark = palette.stemDark;
      const bark = mixColor(cDark, palette.dead || cDark, 0.45);
      const prickle = mixColor(cDark, fPal.dark || fPal.inner || cDark, 0.55);
      const spathe = mixColor(cDark, palette.wilted || cDark, 0.35);
      const put = (n, offset, char, fg, size, extraRot = 0) => {
        const ca = Math.cos(n.angle);
        const sa = Math.sin(n.angle);
        let rot = n.angle + extraRot;
        if (char === null) {
          const gl = stemGlyph(n.angle);
          char = gl.char;
          rot = gl.rot;
        }
        glyphs.push({ x: originX + n.x + ca * offset, y: groundY - n.y + sa * offset, char, fg, size, rot });
      };
      // Texture characters woven into the core strand, like classic ASCII stems
      const CORE_TEXTURE = { hairy: ['%', '#'], woody: ['#', '%'], winged: ['!', '+'], ridged: [':', ':'], thorny: [':', '+'] };
      let lastNode = 0;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const t = n.y / Math.max(1, shootH);
        const w = Math.max(1, sh.width * (1 - sh.taper * t));
        let strands = w >= 6 ? 3 : (w >= 3.5 ? 2 : 1);
        let spread = w * (pScale || 1.0);
        if (sh.texture === 'twoEdged') { strands = 2; spread = 2.8 * (pScale || 1.0); }
        const size = Math.max(7, Math.round((13 + Math.min(2, w * 0.2)) * (pScale || 1.0)));
        for (let k = 0; k < strands; k++) {
          const off = strands === 1 ? 0 : (k / (strands - 1) - 0.5) * spread;
          let col = (strands > 1 && k === strands - 1) || (strands === 3 && k === 1) ? cDark : cStem;
          if (sh.texture === 'woody' && t < 0.45) col = mixColor(col, bark, 1 - t / 0.45);
          const tex = CORE_TEXTURE[sh.texture];
          const core = strands === 1 || (strands === 3 && k === 1) || (strands === 2 && k === 1);
          let ch = null;
          if (tex && core && i % 5 === 0) ch = tex[0];
          else if (tex && core && i % 7 === 0) ch = tex[1];
          put(n, off, ch, col, size, ch ? 0 : 0);
        }

        const node = Math.floor(n.y / sh.internode);
        const isNode = i > 0 && node !== lastNode;
        lastNode = node;
        const half = (strands === 1 ? 0 : spread / 2) + 2;

        switch (sh.texture) {
          case 'hairy':
            if (i % 2 === 0) {
              const sd = i % 4 === 0 ? 1 : -1;
              put(n, sd * half, "'", cStem, 8, sd * 0.9);
            }
            break;
          case 'thorny':
            // Hooked prickles at nodes and scattered between them, pointing slightly down
            if (isNode || hash01(seed, i) < 0.1) {
              const sd = hash01(seed + 7, i) < 0.5 ? -1 : 1;
              put(n, sd * (half + 1.5), sd < 0 ? '<' : '>', prickle, 11, sd * 0.35);
            }
            break;
          case 'winged':
            // Decurrent spiny wings running down both sides of the stem
            if (i % 2 === 0) {
              for (const sd of [-1, 1]) {
                put(n, sd * (half + 2), sd < 0 ? '<' : '>', cStem, 10);
                if (i % 4 === 0) put(n, sd * (half + 6), "'", cDark, 8, sd * 1.2);
              }
            }
            break;
          case 'woody':
            if (isNode && t < 0.9) put(n, 0, '-', t < 0.45 ? bark : cDark, 10);
            break;
          case 'ridged':
            if (isNode) put(n, 0, ':', cDark, 11);
            break;
          case 'scape':
            if (isNode && t > 0.15 && t < 0.88) {
              put(n, -3, '(', spathe, 12, 0.15);
              put(n, 3, ')', spathe, 12, -0.15);
            }
            break;
          default:
            break;
        }
      }
    }

    /**
     * One stem leaf in the species' form, rising from its axil and drooping with size:
     * cordate (sunflower), ovate (hibiscus), odd-pinnate (rose), finely pinnate
     * (marigold) or spiny-lobed (thistle). Leaves lengthen first and broaden later as
     * they unfurl, and wilted leaves hang and curl.
     */
    static _stemLeaf(out, lp, bx, by, side, scale, maturity, wilted, tilt, flutter, palette) {
      const m = clamp(maturity, 0.06, 1);
      const L = (lp.length || 36) * scale * (0.3 + 0.7 * m);
      const size = clamp(9 * Math.sqrt(scale), 8, 11);
      const edge = wilted ? palette.wilted : palette.stem;
      const vein = wilted ? palette.dead : palette.stemDark;
      const droop = lp.droop || 0.1;
      const lift = wilted ? -0.9 : (0.6 - droop * m * 0.8 + tilt);
      const ang = (side < 0 ? Math.PI + lift : -lift) + flutter * 0.8;
      const curl = side * (wilted ? 0.35 : droop * 0.5 * m);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const along = (u, len) => ({ x: bx + ca * u * len - sa * curl * len * u * u, y: by + sa * u * len + ca * curl * len * u * u });

      if (lp.form === 'cordate' || lp.form === 'ovate') {
        const pet = L * (lp.petiole || 0);
        const pEnd = along(pet / Math.max(1, L), L);
        strokeAlong(out, [{ x: bx, y: by }, pEnd], vein, size * 0.9);
        const W = L * (lp.width || 0.5) * 0.5 * Math.pow(m, 1.2);
        drawLamina(out, pEnd.x, pEnd.y, ang + curl * 0.6, L - pet, W, LAMINA[lp.form], {
          edge, rib: vein, serrate: lp.serrate && !wilted, curl, size
        });
      } else if (lp.form === 'spinyLobed') {
        const W = L * (lp.width || 0.36) * 0.5 * Math.pow(m, 1.2);
        const shape = u => LAMINA.lanceolate(u) * (0.5 + 0.5 * Math.abs(Math.sin(3.5 * Math.PI * u)));
        drawLamina(out, bx, by, ang, L, W, shape, { edge, rib: vein, curl, size });
        if (!wilted) {
          for (let k = 0; k < 3; k++) {
            const u = (k + 0.5) / 3.5;
            for (const sd of [-1, 1]) {
              const v = sd * W * shape(u) * 1.05;
              const px = bx + ca * u * L - sa * (curl * L * u * u + v);
              const py = by + sa * u * L + ca * (curl * L * u * u + v);
              const dir = ang + sd * (Math.PI / 2 - 0.5);
              out.push({ x: px + Math.cos(dir) * 2.5, y: py + Math.sin(dir) * 2.5, char: "'", fg: vein, size: 8, rot: dir + Math.PI / 2 });
            }
          }
        }
      } else if (lp.form === 'pinnate' || lp.form === 'pinnateFine') {
        const fine = lp.form === 'pinnateFine';
        const rachis = [];
        for (let i = 0; i <= 6; i++) rachis.push(along(i / 6, L));
        strokeAlong(out, rachis, vein, size * 0.85);
        const pairs = fine ? 6 : (L > 30 ? 3 : 2);
        const lfL = L * (fine ? 0.26 : 0.32);
        const lfW = lfL * (fine ? 0.1 : 0.28) * Math.pow(m, 1.2);
        const start = lp.petiole || 0.12;
        for (let k = 0; k < pairs; k++) {
          const u = start + (0.92 - start) * (k / pairs);
          const p = along(u, L);
          const q = along(Math.min(1, u + 0.02), L);
          const ra = Math.atan2(q.y - p.y, q.x - p.x);
          const len = lfL * (1 - 0.3 * u) * (0.4 + 0.6 * m);
          for (const sd of [-1, 1]) {
            const la = ra + sd * (fine ? 0.8 : 0.95) + (wilted ? side * 0.5 : 0);
            if (fine) {
              strokeAlong(out, [p, { x: p.x + Math.cos(la) * len, y: p.y + Math.sin(la) * len }], edge, size * 0.85);
            } else {
              drawLamina(out, p.x, p.y, la, len, lfW, LAMINA.ovate, { edge, size: size * 0.85 });
            }
          }
        }
        // Terminal leaflet
        const tip = rachis[rachis.length - 1];
        const pre = rachis[rachis.length - 2];
        const ta = Math.atan2(tip.y - pre.y, tip.x - pre.x);
        if (fine) strokeAlong(out, [tip, { x: tip.x + Math.cos(ta) * lfL * 0.8, y: tip.y + Math.sin(ta) * lfL * 0.8 }], edge, size * 0.85);
        else drawLamina(out, tip.x, tip.y, ta, lfL * 0.9 * (0.4 + 0.6 * m), lfW * 1.1, LAMINA.ovate, { edge, serrate: lp.serrate && !wilted, size: size * 0.85 });
      }
    }

    /**
     * Flower stalk (peduncle): continues the stem from its tip (x0, y0), leaving along the
     * stem's tangent, and curves into the bottom of the head so no flower floats above
     * its stem. The attachment point is the lowest head glyph near the head's axis, so
     * it follows each species' shape, its bloom stage, nodding and wilting.
     */
    static _peduncle(out, head, x0, y0, lean, axisX, scale, palette) {
      if (!head || head.length === 0) return;
      const reach = 6 * scale + 3;
      let target = null;
      for (let i = 0; i < head.length; i++) {
        const g = head[i];
        if (Math.abs(g.x - axisX) <= reach && (!target || g.y > target.y)) target = g;
      }
      if (!target || target.y >= y0 - 2) return;
      const tx = target.x;
      const ty = target.y + 1.5;
      const dist = Math.hypot(tx - x0, ty - y0);
      // Quadratic Bézier: leave along the stem's direction, arrive under the head
      const cx = x0 + Math.sin(lean) * dist * 0.5;
      const cy = y0 - Math.cos(lean) * dist * 0.5;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        pts.push({ x: u * u * x0 + 2 * u * t * cx + t * t * tx, y: u * u * y0 + 2 * u * t * cy + t * t * ty });
      }
      strokeAlong(out, pts, palette.stem, 13, { spacing: 7 });
    }

    /**
     * Recolour green tissue by height:
     *  - senescence browns the plant from the base upward (green -> straw -> brown),
     *    so the tip stays green longest, as in real plants;
     *  - a spent flower yellows only the top of its own stalk (peduncle), fading back
     *    as the next bud forms. A finished flower never browns the whole plant.
     */
    static _applyAgeing(glyphs, pData, groundY, palette) {
      const sen = pData.ageing !== undefined ? pData.ageing : (pData.senescence || 0);
      const spent = pData.flowerSpent || 0;
      if (sen <= 0 && spent <= 0) return;
      const stem = palette.stem;
      const stemDark = palette.stemDark;
      const straw = palette.wilted || '#b08e2f';
      const brown = palette.dead || '#7d5c28';
      const strawDark = mixColor(straw, brown, 0.5);
      const h = Math.max(1, pData.shootHeight);

      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        if (g.fg !== stem && g.fg !== stemDark) continue;
        const yFrac = clamp((groundY - g.y) / h, 0, 1.2);
        let a = smoothstep(yFrac * 0.55, yFrac * 0.55 + 0.45, sen);
        if (spent > 0 && yFrac > 0.8) a = Math.max(a, spent * 0.3 * Math.min(1, (yFrac - 0.8) / 0.2));
        if (a <= 0) continue;
        const mid = g.fg === stem ? straw : strawDark;
        g.fg = a < 0.5 ? mixColor(g.fg, mid, a * 2) : mixColor(mid, brown, (a - 0.5) * 2);
      }
    }
  }

  // =========================================================================
  // 5. PROCEDURAL FLOWER HEAD GEOMETRY ENGINE (GRADUAL BUD-TO-BLOOM MATH)
  // =========================================================================

  const HEAD_ROT_RESPONSE = { hibiscus: 0.25, iris: 0.45, tulip: 0.7, flytrap: 0.6, daffodil: 0.4 };

  class ProceduralFlowerRenderer {
    /**
     * headRot rotates the whole head (clockwise radians) around its centre so heads nod
     * with the stem tip and the wind; variant (0..1) gives each individual its own
     * petal irregularity.
     */
    static generateGlyphs(type, cx, cy, scale, bloom, palette, time = 0, seedsBlown = false, wilt = 0, headRot = 0, variant = 0, opts = {}) {
      const glyphs = this._generateUpright(type, cx, cy, scale, bloom, palette, time, seedsBlown, variant, opts);
      return this._finishHead(glyphs, type, cx, cy, scale, palette, wilt, headRot);
    }

    /**
     * A spent flower head that holds its seeds until they drop.
     * progress: 0 = just set seed, 1 = every seed has fallen.
     */
    static generateSeedHead(type, cx, cy, scale, palette, progress = 0, headRot = 0, variant = 0) {
      const glyphs = [];
      const fPal = palette.flowers[type] || palette.flowers.sunflower;
      const dry = mixColor(palette.wilted || '#b08e2f', palette.dead || '#7d5c28', 0.45);
      const dark = palette.dead || '#7d5c28';
      const remaining = 1 - clamp(progress, 0, 1);
      const s = scale;
      const fcy = cy - 18 * s;

      if (type === 'rose') {
        // Rose hip: a swollen, glossy fruit below withered sepals
        const hip = mixColor(fPal.dark || fPal.petal, dark, 0.35);
        [[-5, 0, '('], [0, -2, '0'], [5, 0, ')'], [0, 6, 'v']].forEach(([dx, dy, ch]) => {
          glyphs.push({ x: cx + dx * s, y: fcy + dy * s, char: ch, fg: ch === 'v' ? dry : hip, size: 14 * s });
        });
        [-1, 0, 1].forEach(k => glyphs.push({ x: cx + k * 6 * s, y: fcy - 10 * s, char: k === 0 ? '^' : (k < 0 ? '\\' : '/'), fg: dry, size: 11 * s }));
      } else if (type === 'dandelion') {
        this._buildDandelion(glyphs, cx, cy, scale, 1.0, Object.assign({}, fPal, { seed: dry, core: dark }), 0, true);
      } else if (type === 'sunflower' || type === 'marigold' || type === 'daffodil' || type === 'thistle') {
        // Seed disc: florets have become seeds; they fall out as progress advances
        const rDisc = (type === 'sunflower' ? 18 : 11) * s;
        const count = Math.round((type === 'sunflower' ? 46 : 22) * (0.25 + 0.75 * remaining));
        const golden = 2.3999632;
        for (let k = 0; k < count; k++) {
          const rf = Math.sqrt((k + 0.5) / count);
          const th = k * golden + variant * 6;
          glyphs.push({
            x: cx + Math.cos(th) * rf * rDisc,
            y: fcy + Math.sin(th) * rf * rDisc * 0.85,
            char: k % 3 === 0 ? '.' : (k % 3 === 1 ? ':' : '#'),
            fg: rf < 0.6 ? dark : dry,
            size: Math.max(9, Math.round(11 * s))
          });
        }
        // A ring of withered bracts
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          glyphs.push({ x: cx + Math.cos(a) * (rDisc + 5 * s), y: fcy + Math.sin(a) * (rDisc + 5 * s) * 0.85 + 3 * s, char: '~', fg: dry, size: 10 * s, rot: a + Math.PI / 2 });
        }
      } else {
        // Seed capsule (tulip, iris, hibiscus, flytrap): splits open from the top
        const split = clamp(progress * 1.4, 0, 1);
        for (let row = 0; row < 4; row++) {
          const y = fcy + 8 * s - row * 7 * s;
          glyphs.push({ x: cx - (5 + split * row * 1.5) * s, y, char: '(', fg: dry, size: 13 * s });
          glyphs.push({ x: cx + (5 + split * row * 1.5) * s, y, char: ')', fg: dry, size: 13 * s });
          if (remaining > row * 0.25) glyphs.push({ x: cx, y, char: ':', fg: dark, size: 12 * s });
        }
        glyphs.push({ x: cx, y: fcy - 22 * s, char: split > 0.3 ? 'v' : '^', fg: dry, size: 12 * s });
      }
      // Spent heads nod under their own weight
      return this._finishHead(glyphs, type, cx, cy, scale, palette, 0, headRot + 0.25 * Math.sign(headRot || 1));
    }

    static _finishHead(glyphs, type, cx, cy, scale, palette, wilt, headRot) {
      wilt = wilt === true ? 1 : clamp(+wilt || 0, 0, 1);
      // Row-built heads (hibiscus, iris) read as slanted slabs when rotated far
      headRot = clamp(headRot * (HEAD_ROT_RESPONSE[type] !== undefined ? HEAD_ROT_RESPONSE[type] : 1.0), -0.4, 0.4);
      if (headRot) {
        const pivotY = cy - 22 * scale;
        const c = Math.cos(headRot);
        const s = Math.sin(headRot);
        for (let i = 0; i < glyphs.length; i++) {
          const g = glyphs[i];
          const dx = g.x - cx;
          const dy = g.y - pivotY;
          g.x = cx + dx * c - dy * s;
          g.y = pivotY + dx * s + dy * c;
          g.rot = (g.rot || 0) + headRot;
        }
      }
      // Wilt after rotation so drooping always points down (gravity), whatever the tilt
      return this._applyWilt(glyphs, cx, cy, scale, wilt, palette);
    }

    /**
     * Gradual, palette-aware wilting shared by every species (w in 0..1):
     * outer petals shed first (deterministically, so the same ones stay gone), colours
     * fade in steps toward the palette's own withered tones, and the head droops.
     */
    static _applyWilt(glyphs, cx, cy, scale, w, palette) {
      if (w <= 0 || glyphs.length === 0) return glyphs;
      const withered = mixColor(palette.wilted || '#b08e2f', palette.dead || '#7d5c28', 0.55);
      const centreY = cy - 22 * scale;
      let maxR = 1;
      for (let i = 0; i < glyphs.length; i++) {
        maxR = Math.max(maxR, Math.hypot(glyphs[i].x - cx, glyphs[i].y - centreY));
      }
      const out = [];
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        const r = Math.hypot(g.x - cx, g.y - centreY) / maxR;
        const h = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
        if (r > 0.4 && h < w * 0.85 * (r - 0.4) / 0.6) continue; // shed petal
        g.x += (cx - g.x) * 0.15 * w * r;                         // collapse inward
        g.y += w * r * r * 18 * scale;                            // droop under gravity
        g.fg = mixColor(g.fg, withered, w * (0.3 + 0.7 * r));
        out.push(g);
      }
      return out;
    }

    /**
     * Each species is built from the same primitives (laminas, spirals, spheres) and is
     * continuous over bloom 0..1: a bud is the same petals folded closed and still green.
     */
    static _generateUpright(type, cx, cy, scale, bloom, palette, time, seedsBlown, variant, opts = {}) {
      const out = [];
      const pal = palette.flowers[type] || palette.flowers.sunflower;
      const b = clamp(bloom, 0, 1);
      const s = scale;
      switch (type) {
        case 'hibiscus': this._buildHibiscus(out, cx, cy, s, b, pal, palette, variant); break;
        case 'iris': this._buildIris(out, cx, cy, s, b, pal, palette); break;
        case 'thistle': this._buildThistle(out, cx, cy, s, b, pal, palette); break;
        case 'marigold': this._buildMarigold(out, cx, cy, s, b, pal, palette, variant); break;
        case 'daffodil': this._buildDaffodil(out, cx, cy, s, b, pal, palette, variant); break;
        case 'rose': this._buildRose(out, cx, cy, s, b, pal, palette, variant); break;
        case 'dandelion':
          if (opts.clock) this._buildDandelion(out, cx, cy, s, b, pal, time, seedsBlown);
          else this._buildDandelionFlower(out, cx, cy, s, b, pal, palette);
          break;
        case 'tulip': this._buildTulip(out, cx, cy, s, b, pal, palette); break;
        case 'flytrap': this._buildFlytrap(out, cx, cy, s, b, pal, palette); break;
        default: this._buildSunflower(out, cx, cy, s, b, pal, palette, variant);
      }
      return out;
    }

    /**
     * Sunflower capitulum: Fibonacci-numbered ray florets (21 or 34) around a disc of
     * florets packed in a golden-angle spiral, green involucral bracts behind.
     * In bud the bracts close over the disc.
     */
    static _buildSunflower(out, cx, cy, s, b, pal, P, variant) {
      const fcy = cy - 25 * s;
      const o = smoothstep(0.2, 1.0, b);
      const ky = 0.88;
      const rD = 22 * s * (0.35 + 0.65 * o);
      const vPhase = (variant || 0) * 40;
      const golden = 2.3999632;

      // Involucral bracts (phyllaries) peeking between the rays
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + 0.17;
        const r = rD * (1.0 + 0.12 * (1 - o));
        const ang = Math.atan2(Math.sin(a) * ky, Math.cos(a));
        out.push({ x: cx + Math.cos(a) * r, y: fcy + Math.sin(a) * r * ky, char: '^', fg: k % 2 ? P.stem : P.stemDark, size: Math.max(8, 10 * s), rot: ang + Math.PI / 2 });
      }

      if (o < 0.25) {
        // Closed bud: overlapping bracts spiral over the disc
        const nb = 22;
        for (let k = 0; k < nb; k++) {
          const rf = Math.sqrt((k + 0.5) / nb);
          const th = k * golden;
          out.push({ x: cx + Math.cos(th) * rf * rD, y: fcy + Math.sin(th) * rf * rD * ky, char: '^', fg: k % 2 ? P.stem : P.stemDark, size: Math.max(8, 10 * s), rot: th + Math.PI / 2 });
        }
        if (o < 0.12) return;
      }

      // Ray florets: strap-shaped, slightly irregular per individual, foreshortened by tilt
      if (o > 0.08) {
        const nR = s >= 1.0 ? 34 : 21;
        for (let i = 0; i < nR; i++) {
          const a = (i / nR) * Math.PI * 2 + vPhase * 0.013;
          const irr = 1 + 0.16 * Math.sin(i * 2.7 + vPhase) + 0.08 * Math.sin(i * 5.3 + vPhase * 1.7);
          const fore = Math.hypot(Math.cos(a), Math.sin(a) * ky);
          const ang = Math.atan2(Math.sin(a) * ky, Math.cos(a));
          const bx = cx + Math.cos(a) * rD * 0.9;
          const by = fcy + Math.sin(a) * rD * 0.9 * ky;
          drawLamina(out, bx, by, ang, 34 * s * o * irr * fore, 4.6 * s, LAMINA.lanceolate, {
            edge: i % 2 ? pal.petal : pal.petalWarm, edgeStyle: 'line', size: Math.max(8, 9.5 * s), curl: 0.12 * Math.sin(i * 1.3 + vPhase)
          });
        }
      }

      // Disc florets: dark seeds at the centre, opening (pollen) florets at the rim
      const nF = Math.min(130, Math.floor(80 * (0.35 + 0.65 * o) * Math.max(0.6, s * s)));
      for (let k = 0; k < nF; k++) {
        const rf = Math.sqrt((k + 0.5) / nF);
        const r = rf * rD;
        const th = k * golden + vPhase * 0.02;
        let ch;
        let col;
        if (rf < 0.35) { ch = k % 3 === 0 ? '8' : '&'; col = pal.coreDeep; }
        else if (rf < 0.8) { ch = k % 2 === 0 ? '*' : '#'; col = pal.core; }
        else { ch = 'o'; col = pal.petalWarm; }
        out.push({ x: cx + Math.cos(th) * r, y: fcy + Math.sin(th) * r * ky, char: ch, fg: col, size: Math.max(7, (7.5 + (1 - rf) * 3) * s) });
      }
    }

    /**
     * Hibiscus: five broad, overlapping obovate petals with a dark eye, a long staminal
     * column carrying anthers and five stigma pads. In bud the petals are a twisted
     * green spindle inside the calyx.
     */
    static _buildHibiscus(out, cx, cy, s, b, pal, P, variant) {
      const fcy = cy - 25 * s;
      const o = smoothstep(0.15, 1.0, b);
      const ky = 0.82;
      const ph = (variant || 0) * 1.2;

      // Calyx lobes
      for (let k = 0; k < 5; k++) {
        const a = lerp(-Math.PI / 2 + (k - 2) * 0.22, Math.PI / 2 + (k - 2) * 0.45, o * 0.7);
        drawLamina(out, cx, fcy + 4 * s, a, 9 * s, 2.4 * s, LAMINA.lanceolate, { edge: P.stemDark, size: Math.max(8, 8 * s + 1) });
      }

      // Petals: draw the upper (back) ones first so the front ones overlap them
      const petals = [];
      for (let k = 0; k < 5; k++) {
        const aOpen = -Math.PI / 2 + 0.3 + (k * 2 * Math.PI) / 5 + ph;
        const aBud = -Math.PI / 2 + (k - 2) * 0.1;
        petals.push({ k, a: lerp(aBud, aOpen, o) });
      }
      petals.sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
      const fill = u => (u < 0.3 ? ripen(pal.inner, b, P) : (u < 0.62 ? ripen(pal.mid, b, P) : ripen(pal.outer, b, P)));
      petals.forEach(({ k, a }) => {
        const fore = Math.hypot(Math.cos(a), Math.sin(a) * ky);
        const ang = Math.atan2(Math.sin(a) * ky, Math.cos(a));
        const L = 33 * s * (0.45 + 0.55 * o) * lerp(1, fore, o);
        const W = 15 * s * (0.2 + 0.8 * o);
        drawLamina(out, cx, fcy, ang, L, W, LAMINA.obovate, {
          edge: ripen(pal.outer, b, P), fill, hatch: 2, texture: ['@', '#', '*', '%'], rib: ripen(pal.inner, b, P), ribTo: 0.4,
          curl: 0.25 * (1 - o) + 0.1 * Math.sin(k * 2.1 + ph), size: Math.max(8, 10 * s)
        });
      });

      // Staminal column
      if (o > 0.35) {
        const grow = smoothstep(0.35, 1, o);
        const colLen = 36 * s * grow;
        const ca = -Math.PI / 2 + 0.55 + 0.1 * Math.sin(ph);
        const pts = [];
        for (let j = 0; j <= 8; j++) {
          const u = j / 8;
          pts.push({ x: cx + Math.cos(ca) * colLen * u + 6 * s * u * u, y: fcy + Math.sin(ca) * colLen * u - 3 * s * u * u });
        }
        strokeAlong(out, pts, pal.stamen, Math.max(8, 9 * s));
        for (let j = 5; j <= 7; j++) {
          for (const sd of [-1, 1]) {
            out.push({ x: pts[j].x + sd * 3 * s, y: pts[j].y + sd * 1.5 * s, char: '*', fg: pal.anther, size: Math.max(7, 8 * s) });
          }
        }
        const tip = pts[8];
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          out.push({ x: tip.x + Math.cos(a) * 3 * s, y: tip.y + Math.sin(a) * 3 * s - 2 * s, char: 'o', fg: pal.inner, size: Math.max(7, 7 * s) });
        }
      }
    }

    /**
     * Bearded iris: three upright standards arching inward, three falls flaring out and
     * curling under with a fuzzy yellow beard, pale style arms over the falls.
     * In bud all six fold into a narrow spear.
     */
    static _buildIris(out, cx, cy, s, b, pal, P) {
      const fcy = cy - 22 * s;
      const o = smoothstep(0.12, 1.0, b);
      const closed = -Math.PI / 2;

      const falls = [{ a: Math.PI - 0.45, len: 38, c: -1 }, { a: 0.45, len: 38, c: 1 }, { a: Math.PI / 2, len: 21, c: 0 }];
      falls.forEach((f, i) => {
        const ang = lerp(closed + (i - 1) * 0.08, f.a, o);
        const L = f.len * s * (0.55 + 0.45 * o);
        const W = 11 * s * (0.3 + 0.7 * o);
        const curl = f.c * 0.45 * o;
        drawLamina(out, cx, fcy, ang, L, W, LAMINA.obovate, {
          edge: ripen(pal.fall, b, P), fill: ripen(pal.deep, b, P), hatch: 2, texture: ['%', '@', '#'], rib: ripen(pal.deep, b, P), curl, size: Math.max(8, 10 * s)
        });
        if (o > 0.3) {
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          for (let u = 0.12; u < 0.5; u += 0.09) {
            const off = curl * L * u * u;
            out.push({ x: cx + ca * u * L - sa * off, y: fcy + sa * u * L + ca * off, char: '*', fg: pal.signal, size: Math.max(7, 7.5 * s), rot: ang });
          }
        }
      });

      const stds = [{ a: closed - 0.42, c: 1 }, { a: closed + 0.42, c: -1 }, { a: closed, c: 0, back: true }];
      stds.forEach((st, i) => {
        const ang = lerp(closed + (i - 1) * 0.05, st.a, o);
        drawLamina(out, cx, fcy - 3 * s, ang, 37 * s * (0.55 + 0.45 * o) * (st.back ? 0.9 : 1), 10.5 * s * (0.35 + 0.65 * o), LAMINA.obovate, {
          edge: ripen(pal.standard, b, P), fill: ripen(mixColor(pal.standard, pal.fall, 0.35), b, P),
          hatch: st.back ? 0 : 1, texture: ['%', '&'], curl: st.c * 0.4 * o, size: Math.max(8, 10 * s)
        });
      });

      if (o > 0.4) {
        [Math.PI - 0.5, 0.5, Math.PI / 2].forEach(a => {
          drawLamina(out, cx, fcy, a, 10 * s * o, 2.6 * s, LAMINA.lanceolate, { edge: pal.standard, size: Math.max(7, 8 * s) });
        });
      }
    }

    /**
     * Thistle: an urn-shaped involucre of overlapping spine-tipped bracts, crowned by a
     * dense brush of purple florets that fans out as it opens.
     */
    static _buildThistle(out, cx, cy, s, b, pal, P) {
      const fcy = cy - 10 * s;
      const o = smoothstep(0.12, 1.0, b);
      const H = 24 * s;
      const W = 13 * s;

      for (let r = 0; r < 6; r++) {
        const v = r / 5;
        const y = fcy - v * H;
        const half = W * Math.sin(Math.PI * (0.18 + 0.7 * v)) * (1 - 0.25 * v);
        const cols = 3 + Math.round(half / (3.5 * s));
        for (let c = 0; c < cols; c++) {
          const u = (c / (cols - 1)) * 2 - 1;
          const x = cx + u * half;
          const dir = Math.atan2(-1 - v * 0.2, u * 1.4);
          out.push({ x, y, char: '^', fg: (r + c) % 2 ? pal.calyx : P.stemDark, size: Math.max(8, 10 * s), rot: dir + Math.PI / 2 });
          if ((r + c) % 2 === 0) {
            out.push({ x: x + Math.cos(dir) * 4 * s, y: y + Math.sin(dir) * 4 * s, char: "'", fg: pal.calyx, size: Math.max(7, 8 * s), rot: dir + Math.PI / 2 });
          }
        }
      }

      if (o > 0.05) {
        const n = 24;
        const topY = fcy - H;
        for (let i = 0; i < n; i++) {
          const t = (i / (n - 1)) * 2 - 1;
          const phi = -Math.PI / 2 + t * (0.3 + 0.7 * o);
          const len = 24 * s * o * (0.85 + 0.15 * Math.cos(i * 2.3));
          const bx = cx + t * W * 0.45;
          strokeAlong(out, [{ x: bx, y: topY + 2 * s }, { x: bx + Math.cos(phi) * len, y: topY + Math.sin(phi) * len }],
            f => (f < 0.4 ? pal.brushDark : pal.brush), Math.max(8, 9 * s));
          out.push({ x: bx + Math.cos(phi) * (len + 2 * s), y: topY + Math.sin(phi) * (len + 2 * s), char: '·', fg: pal.brush, size: Math.max(8, 9 * s) });
        }
      }
    }

    /**
     * French marigold: a double pompon dome of ruffled florets in rings, bicolour with a
     * mahogany base blotch and golden ruffled tips, over a green involucral tube.
     */
    static _buildMarigold(out, cx, cy, s, b, pal, P, variant) {
      const fcy = cy - 20 * s;
      const o = smoothstep(0.15, 1.0, b);
      const ky = 0.68;
      drawLamina(out, cx, fcy + 15 * s, -Math.PI / 2, 14 * s, 5.5 * s, LAMINA.spindle, { edge: P.stemDark, fill: P.stem, hatch: 1, size: Math.max(8, 9 * s) });
      if (o < 0.1) {
        out.push({ x: cx, y: fcy - 1 * s, char: '*', fg: ripen(pal.orange, b, P), size: Math.max(8, 10 * s) });
        return;
      }
      const rings = 5;
      const Rmax = 24 * s * (0.35 + 0.65 * o);
      const ph = (variant || 0) * 9;
      for (let ri = rings - 1; ri >= 0; ri--) {
        const f = (ri + 1) / rings;
        const R = Rmax * f;
        const lift = (1 - f) * 11 * s * o;
        const n = 6 + Math.round(9 * f);
        const tipCol = ripen(f > 0.6 ? pal.orange : pal.yellow, b, P);
        const baseCol = ripen(pal.crimson, b, P);
        for (let p = 0; p < n; p++) {
          const a = (p / n) * Math.PI * 2 + ri * 0.45 + ph;
          const x0 = cx + Math.cos(a) * R * 0.55;
          const y0 = fcy + Math.sin(a) * R * 0.55 * ky - lift;
          const ang = Math.atan2(Math.sin(a) * ky, Math.cos(a));
          const fore = Math.hypot(Math.cos(a), Math.sin(a) * ky);
          const len = (R * 0.5 + 4 * s) * fore;
          strokeAlong(out, [{ x: x0, y: y0 }, { x: x0 + Math.cos(ang) * len, y: y0 + Math.sin(ang) * len }],
            fr => (fr < 0.45 ? baseCol : tipCol), Math.max(8, 10 * s), { chars: ['%', '&', '@', '#'], phase: p + ri });
          out.push({ x: x0 + Math.cos(ang) * (len + 1.5 * s), y: y0 + Math.sin(ang) * (len + 1.5 * s), char: '~', fg: tipCol, size: Math.max(8, 9.5 * s), rot: ang + Math.PI / 2 });
        }
      }
    }

    /**
     * Daffodil (Narcissus): the flower faces sideways and a little toward the viewer,
     * nodding slightly. Six pointed tepals form a star in that tilted plane; a long,
     * ribbed trumpet (corona) projects out of it, ending in a flared ruffled rim around a
     * dark throat. The green ovary and the papery spathe sit behind, where the stalk
     * joins. The bud is a closed point emerging from the spathe.
     */
    static _buildDaffodil(out, cx, cy, s, b, pal, P, variant) {
      const face = (variant || 0) < 0.5 ? -1 : 1;
      s *= 1.3;           // daffodil flowers are large for the plant
      const fcy = cy - 14 * s;
      const o = smoothstep(0.15, 1.0, b);
      const yawS = 0.5;   // the flower is turned ~30° to the side: the cup reads face-on
      const yawC = 0.87;
      // (u, v) lie in the flower plane, w points out along the trumpet
      const at = (u, v, w) => ({ x: cx + face * (u * yawC + w * yawS), y: fcy - v + w * 0.22 });
      const size = Math.max(8, 9.5 * s);
      const spathe = mixColor(P.wilted || P.stemDark, P.stem, 0.35);
      const petal = ripen(pal.petal, b, P);
      const cup = ripen(pal.cup, b, P);
      const throat = ripen(pal.inner, b, P);

      // Ovary and papery spathe where the stalk joins, below and behind the flower
      const ovary = at(0, -(o < 0.1 ? 0 : 9 * s), -5 * s);
      drawLamina(out, ovary.x, ovary.y, Math.atan2(o < 0.1 ? -1 : 0.85, -face * 0.75), 14 * s, 3 * s, LAMINA.lanceolate,
        { edge: spathe, fill: spathe, hatch: 1, texture: [':', "'"], size });
      out.push({ x: ovary.x, y: ovary.y, char: 'o', fg: P.stem, size: Math.max(8, 10 * s) });

      if (o < 0.1) {
        // Closed bud pointing forward and down out of its sheath
        const a = Math.atan2(0.4, face * 0.9);
        drawLamina(out, ovary.x, ovary.y, a, 25 * s, 5 * s, LAMINA.spindle, { edge: petal, fill: cup, hatch: 1, texture: [':'], size });
        drawLamina(out, ovary.x, ovary.y, a, 13 * s, 5.8 * s, LAMINA.spindle, { edge: spathe, size });
        return;
      }

      // Perianth: six pointed tepals in the turned flower plane. They start at the edge of
      // the cup (which hides their bases on a real flower) so the centre stays clear.
      const R1 = 11 * s * (0.6 + 0.4 * o);   // cup rim radius
      for (let k = 0; k < 6; k++) {
        const th = Math.PI / 2 + (k * Math.PI) / 3 + 0.06 * Math.sin(k * 2.3 + (variant || 0) * 9);
        const dx = face * Math.cos(th) * yawC;
        const dy = -Math.sin(th);
        const fore = Math.hypot(dx, dy);
        const base = at(Math.cos(th) * R1 * 0.7, Math.sin(th) * R1 * 0.7, 0);
        const len = (27 * s * (0.35 + 0.65 * o) - R1 * 0.7) * fore;
        const wid = 10 * s * (0.4 + 0.6 * o) * Math.hypot(Math.sin(th) * yawC, Math.cos(th));
        drawLamina(out, base.x, base.y, Math.atan2(dy, dx), len, wid, LAMINA.tepal, {
          edge: petal, fill: mixColor(petal, cup, 0.15), hatch: 1, texture: [':', "'"], size
        });
      }

      // Corona: a solid orange cup projecting toward the viewer — a textured fill, a bright
      // ruffled rim offset toward the viewer, and a dark throat
      const T = 10 * s * (0.3 + 0.7 * o);
      const ring = (r, w, ruffle, steps) => {
        const pts = [];
        for (let j = 0; j <= steps; j++) {
          const ph = (j / steps) * Math.PI * 2;
          const rr = r * (1 + ruffle * Math.sin(ph * 9));
          pts.push(at(rr * Math.cos(ph), rr * Math.sin(ph), w));
        }
        return pts;
      };
      strokeAlong(out, ring(R1 * 0.62, T * 0.6, 0, 18), cup, Math.max(7, 8.5 * s), { chars: ['%', '&', '%', '#'] });
      strokeAlong(out, ring(R1, T, 0.1, 32), mixColor(cup, petal, 0.25), size);
      for (let j = 0; j < 9; j++) {
        const ph = ((j + 0.25) / 9) * Math.PI * 2;
        const p = at(R1 * 1.14 * Math.cos(ph), R1 * 1.14 * Math.sin(ph), T);
        out.push({ x: p.x, y: p.y, char: '~', fg: cup, size: Math.max(7, 8 * s), rot: ph + Math.PI / 2 });
      }
      const c = at(0, 0, T * 0.8);
      out.push({ x: c.x, y: c.y, char: '@', fg: throat, size: Math.max(8, 10 * s) });
      for (let j = 0; j < 4; j++) {
        const ph = (j / 4) * Math.PI * 2 + 0.4;
        const p = at(R1 * 0.3 * Math.cos(ph), R1 * 0.3 * Math.sin(ph), T * 0.8);
        out.push({ x: p.x, y: p.y, char: '#', fg: throat, size: Math.max(7, 8 * s) });
      }
    }

    /**
     * Rose: petals in a golden-angle spiral, inner ones cupped tight and upright, outer
     * ones wide with reflexed lips; five slender sepals wrap the bud and reflex as the
     * flower opens. A closed bud is the same spiral, tall and narrow.
     */
    static _buildRose(out, cx, cy, s, b, pal, P, variant) {
      const fcy = cy - 22 * s;
      const o = smoothstep(0.12, 1.0, b);
      const ky = 0.7;

      for (let k = 0; k < 5; k++) {
        const a = lerp(-Math.PI / 2 + (k - 2) * 0.28, Math.PI / 2 + (k - 2) * 0.62, smoothstep(0.1, 0.7, o));
        drawLamina(out, cx + (k - 2) * 2 * s, fcy + 10 * s, a, 17 * s, 2.4 * s, LAMINA.lanceolate, { edge: pal.sepal, size: Math.max(8, 9 * s + 1), curl: (k - 2) * 0.1 });
      }

      const N = 7 + Math.round(19 * o);
      const rMax = 29 * s * (0.3 + 0.7 * o);
      const cupH = (5 + 18 * (1 - o)) * s;
      const ph = (variant || 0) * 6.28;
      const arc = (phi, rr, span, dy) => {
        const pts = [];
        for (let j = 0; j <= 8; j++) {
          const a = phi - span / 2 + (span * j) / 8;
          const bulge = 1 + 0.07 * Math.sin((j / 8) * Math.PI);
          pts.push({ x: cx + Math.cos(a) * rr * bulge, y: fcy + Math.sin(a) * rr * bulge * ky - dy });
        }
        return pts;
      };
      for (let k = N - 1; k >= 0; k--) {
        const f = (k + 1) / N;
        const r = rMax * Math.sqrt(f);
        const phi = k * 2.3999632 + ph;
        const lift = (1 - f) * cupH;
        const span = (0.8 + 1.5 * f) * (0.55 + 0.45 * o);
        const col = f < 0.3 ? pal.dark : (f < 0.72 ? pal.petal : pal.light);
        strokeAlong(out, arc(phi, r, span, lift), ripen(col, b, P), Math.max(8, (10 + 3 * f) * s), { chars: ['(', '{', '('], align: 'tangent', phase: k });
        if (f > 0.35) strokeAlong(out, arc(phi, r * 0.84, span * 0.8, lift + 2 * s), ripen(mixColor(col, pal.dark, 0.5), b, P), Math.max(8, 9.5 * s), { chars: ['%', '@', '&'], phase: k });
        if (o > 0.55 && f > 0.72) {
          out.push({ x: cx + Math.cos(phi) * r * 1.08, y: fcy + Math.sin(phi) * r * 1.08 * ky - lift, char: '~', fg: pal.light, size: Math.max(8, 10 * s), rot: phi + Math.PI / 2 });
        }
      }
    }

    /**
     * Dandelion in flower: a flat golden head of many strap-shaped ray florets in rings,
     * outer green bracts reflexed below. The bud is a closed green spindle.
     */
    static _buildDandelionFlower(out, cx, cy, s, b, pal, P) {
      const fcy = cy - 18 * s;
      const o = smoothstep(0.12, 1.0, b);
      const ky = 0.72;
      for (let k = 0; k < 8; k++) {
        const a = lerp(-Math.PI / 2 + (k - 3.5) * 0.15, Math.PI / 2 + (k - 3.5) * 0.32, o);
        strokeAlong(out, [{ x: cx, y: fcy + 5 * s }, { x: cx + Math.cos(a) * 9 * s, y: fcy + 5 * s + Math.sin(a) * 9 * s }], P.stem, Math.max(8, 8 * s));
      }
      if (o < 0.1) {
        drawLamina(out, cx, fcy + 6 * s, -Math.PI / 2, 16 * s, 4.5 * s, LAMINA.spindle, { edge: P.stem, fill: ripen(pal.yellow, b, P), hatch: 1, size: Math.max(8, 9 * s) });
        return;
      }
      const R = 20 * s * (0.3 + 0.7 * o);
      const yellow = ripen(pal.yellow, b, P);
      const deep = ripen(mixColor(pal.yellow, pal.core, 0.3), b, P);
      for (let ring = 3; ring >= 0; ring--) {
        const f = (ring + 1) / 4;
        const n = 10 + ring * 7;
        for (let p = 0; p < n; p++) {
          const a = (p / n) * Math.PI * 2 + ring * 0.37;
          const r0 = R * f * 0.5;
          const r1 = R * f;
          const p0 = { x: cx + Math.cos(a) * r0, y: fcy + Math.sin(a) * r0 * ky - (1 - f) * 4 * s };
          const p1 = { x: cx + Math.cos(a) * r1, y: fcy + Math.sin(a) * r1 * ky - (1 - f) * 4 * s };
          strokeAlong(out, [p0, p1], ring < 1 ? deep : yellow, Math.max(7, 8.5 * s));
        }
      }
    }

    /**
     * Dandelion seed clock: a Fibonacci sphere of parachute seeds (beak + pappus tuft),
     * seeds on the far side dimmer. After the seeds are blown, a bare receptacle with a
     * few stragglers remains.
     */
    static _buildDandelion(out, cx, cy, s, b, pal, time, seedsBlown = false) {
      const fcy = cy - 20 * s;
      out.push({ x: cx, y: fcy, char: '@', fg: pal.core, size: Math.max(8, 10 * s) });

      if (seedsBlown) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * 2 * Math.PI;
          out.push({ x: cx + Math.cos(ang) * 16 * s, y: fcy + Math.sin(ang) * 16 * s, char: "'", fg: pal.seed, size: 12 * s, rot: ang + Math.PI / 2 });
        }
        return;
      }

      const o = smoothstep(0.1, 1.0, b);
      const R = 26 * s * (0.35 + 0.65 * o);
      const N = 52;
      for (let i = 0; i < N; i++) {
        const z = 1 - (2 * (i + 0.5)) / N;
        const rxy = Math.sqrt(1 - z * z);
        const th = i * 2.3999632;
        const X = Math.cos(th) * rxy;
        const Z = Math.sin(th) * rxy;
        const back = Z < 0;
        const beak = mixColor(pal.seed, pal.core, back ? 0.7 : 0.4);
        strokeAlong(out, [{ x: cx + X * R * 0.18, y: fcy - z * R * 0.18 }, { x: cx + X * R * 0.8, y: fcy - z * R * 0.8 }], beak, Math.max(7, 7 * s + 1), { spacing: 6 * s + 1 });
        out.push({ x: cx + X * R, y: fcy - z * R, char: '*', fg: back ? mixColor(pal.seed, pal.core, 0.45) : pal.seed, size: Math.max(7, 9 * s), rot: Math.atan2(-z, X) + Math.PI / 2 });
      }
    }

    /**
     * Tulip goblet: three inner tepals behind three outer ones, rounded with pointed
     * tips; closed and egg-shaped at first, flaring open in full bloom to show the
     * dark stamens. Buds are green and colour up.
     */
    static _buildTulip(out, cx, cy, s, b, pal, P) {
      const fcy = cy - 16 * s;
      const o = smoothstep(0.15, 1.0, b);
      const H = 38 * s * (0.55 + 0.45 * smoothstep(0, 0.4, b));
      const W = 11 * s;
      const petal = ripen(pal.petal, b, P);
      const inner = ripen(pal.inner, b, P);

      [-1, 0, 1].forEach(k => {
        drawLamina(out, cx + k * 4 * s, fcy, -Math.PI / 2 + k * (0.15 + 0.45 * o), H * 1.02, W * 0.9, LAMINA.tepal, {
          edge: inner, fill: inner, hatch: 1, texture: ['%', '#'], curl: -k * 0.25 * (1 - o), size: Math.max(8, 10 * s)
        });
      });

      if (o > 0.45) {
        for (let k = -1; k <= 1; k++) {
          const tx = cx + k * 5 * s;
          strokeAlong(out, [{ x: tx, y: fcy - 2 * s }, { x: tx + k * 2 * s, y: fcy - 16 * s }], mixColor(P.stemDark, pal.inner, 0.5), Math.max(7, 8 * s));
          out.push({ x: tx + k * 2 * s, y: fcy - 18 * s, char: '*', fg: pal.stamen, size: Math.max(8, 9 * s) });
        }
      }

      [-1, 1, 0].forEach(k => {
        drawLamina(out, cx + k * 5 * s, fcy + 2 * s, -Math.PI / 2 + k * (0.12 + 0.7 * o), H, W * (k === 0 ? 1.1 : 0.95), LAMINA.tepal, {
          edge: petal, fill: k === 0 ? mixColor(petal, inner, 0.3) : petal, hatch: 2, texture: ['!', '|', '%'], rib: inner,
          curl: -k * 0.35 * (1 - o * 0.6), size: Math.max(8, 10 * s)
        });
      });
    }

    /**
     * Venus flytrap flower: a small umbel of white five-petalled flowers with green
     * centres, held high above the traps on a thin scape.
     */
    static _buildFlytrap(out, cx, cy, s, b, pal, P) {
      const fcy = cy - 10 * s;
      const o = smoothstep(0.15, 1.0, b);
      const n = 4;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.5;
        const L = 12 * s * (0.6 + 0.4 * o) * (k % 2 ? 0.8 : 1);
        const tip = { x: cx + Math.cos(a) * L, y: fcy + Math.sin(a) * L };
        strokeAlong(out, [{ x: cx, y: fcy }, tip], P.stem, 8);
        if (o < 0.15 || (k === n - 1 && o < 0.5)) {
          out.push({ x: tip.x, y: tip.y, char: 'o', fg: ripen(pal.teeth, b, P), size: 8 });
          continue;
        }
        for (let p = 0; p < 5; p++) {
          drawLamina(out, tip.x, tip.y, (p * 2 * Math.PI) / 5 + k, 6 * s * o + 1, 2.6 * s, LAMINA.obovate, { edge: pal.teeth, size: 8 });
        }
        out.push({ x: tip.x, y: tip.y, char: '·', fg: pal.jaw, size: 9 });
      }
    }
  }

  // =========================================================================
  // 6. GLYPH RENDERING (CANVAS SPRITE ATLAS + ROTATION) & PLAIN-TEXT RASTER
  // =========================================================================

  const FONT_STACK = '"Courier New", Consolas, monospace';

  /**
   * Glyph sprite atlas. Each (char, colour, device-pixel size) is rasterised once with
   * fillText into a shared atlas page and then blitted with drawImage. Re-assigning
   * ctx.font per glyph and drawing rotated text with fillText are both slow paths;
   * blitting cached sprites keeps rotated glyphs as cheap as upright ones.
   */
  class GlyphAtlas {
    constructor(options = {}) {
      // One large page keeps every blit on the same texture so the GPU can batch them
      this.pageSize = options.pageSize || 2048;
      this.maxPages = options.maxPages || 2;
      this.font = options.font || FONT_STACK;
      this.sprites = new Map();
      this.pages = [];
      this._newPage();
    }

    static isSupported() {
      return typeof OffscreenCanvas !== 'undefined' ||
        (typeof document !== 'undefined' && typeof document.createElement === 'function');
    }

    _createCanvas(w, h) {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }

    _newPage() {
      const canvas = this._createCanvas(this.pageSize, this.pageSize);
      const ctx = canvas.getContext('2d');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.page = { canvas, ctx, x: 0, y: 0, rowH: 0 };
      this.pages.push(this.page);
    }

    clear() {
      this.sprites.clear();
      this.pages = [];
      this._newPage();
    }

    /**
     * Sprites are rasterised at bucketed sizes (even device pixels above 14px) and scaled
     * to the exact size when drawn, which bounds the number of sprites per colour.
     */
    static bucket(px) {
      return px <= 14 ? px : Math.round(px / 2) * 2;
    }

    get(char, color, px) {
      const key = char + '\u0000' + color + '\u0000' + px;
      let sprite = this.sprites.get(key);
      if (sprite) return sprite;

      let page = this.page;
      const font = `${px}px ${this.font}`;
      page.ctx.font = font;
      const w = Math.ceil(page.ctx.measureText(char).width) + 4;
      const h = Math.ceil(px * 1.3) + 4;

      if (page.x + w > this.pageSize) {
        page.x = 0;
        page.y += page.rowH;
        page.rowH = 0;
      }
      if (page.y + h > this.pageSize) {
        // Generational flush: when every page is full, start over (sprites are cheap to rebuild)
        if (this.pages.length >= this.maxPages) this.clear();
        else this._newPage();
        page = this.page;
        page.ctx.font = font;
      }

      page.ctx.fillStyle = color;
      page.ctx.fillText(char, page.x + w / 2, page.y + h / 2);
      sprite = { canvas: page.canvas, sx: page.x, sy: page.y, w, h };
      page.x += w;
      page.rowH = Math.max(page.rowH, h);
      this.sprites.set(key, sprite);
      return sprite;
    }
  }

  class GlyphRenderer {
    constructor(options = {}) {
      this.atlas = (options.atlas !== false && GlyphAtlas.isSupported()) ? new GlyphAtlas(options) : null;
    }

    static get shared() {
      if (!GlyphRenderer._shared) GlyphRenderer._shared = new GlyphRenderer();
      return GlyphRenderer._shared;
    }

    /** Device-pixel ratio implied by the context's current transform. */
    static scaleOf(ctx) {
      if (ctx && typeof ctx.getTransform === 'function') {
        const m = ctx.getTransform();
        return Math.hypot(m.a, m.b) || 1;
      }
      return 1;
    }

    /**
     * Draw glyphs (CSS-pixel coordinates). Leaves the context with transform
     * (dpr, 0, 0, dpr, 0, 0) and globalAlpha 1.
     */
    draw(ctx, glyphs, dpr = GlyphRenderer.scaleOf(ctx), opts = {}) {
      const rotate = opts.rotate !== false;
      if (!ctx || !glyphs || glyphs.length === 0) return;
      if (!this.atlas || typeof ctx.setTransform !== 'function') {
        this._drawText(ctx, glyphs);
        return;
      }

      let alpha = 1;
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      let identity = true;

      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        const a = g.alpha !== undefined ? g.alpha : 1;
        if (a <= 0.01) continue;
        if (a !== alpha) {
          ctx.globalAlpha = a;
          alpha = a;
        }

        const exact = Math.max(4, g.size * dpr);
        const px = GlyphAtlas.bucket(Math.round(exact));
        const sp = this.atlas.get(g.char, g.fg, px);
        const k = exact / px;
        const dw = sp.w * k;
        const dh = sp.h * k;
        const rot = rotate ? (g.rot || 0) : 0;

        if (rot > -0.02 && rot < 0.02) {
          if (!identity) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            identity = true;
          }
          // Whole-pixel destinations keep upright glyphs crisp
          ctx.drawImage(sp.canvas, sp.sx, sp.sy, sp.w, sp.h,
            Math.round(g.x * dpr - dw / 2), Math.round(g.y * dpr - dh / 2), dw, dh);
        } else {
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          ctx.setTransform(c, s, -s, c, g.x * dpr, g.y * dpr);
          identity = false;
          ctx.drawImage(sp.canvas, sp.sx, sp.sy, sp.w, sp.h, -dw / 2, -dh / 2, dw, dh);
        }
      }

      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Fallback for environments without an atlas (e.g. minimal mock contexts)
    _drawText(ctx, glyphs) {
      if (typeof ctx.fillText !== 'function') return;
      if (typeof ctx.save === 'function') ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let font = '';
      let fill = '';
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        const f = `${Math.round(g.size)}px ${FONT_STACK}`;
        if (f !== font) { ctx.font = f; font = f; }
        if (g.fg !== fill) { ctx.fillStyle = g.fg; fill = g.fg; }
        ctx.globalAlpha = g.alpha !== undefined ? g.alpha : 1;
        ctx.fillText(g.char, g.x, g.y);
      }
      if (typeof ctx.restore === 'function') ctx.restore();
    }
  }

  /**
   * Rasterise glyphs into a character grid for terminals, READMEs and chat.
   * Fits the drawing into cols x rows while correcting for the ~1:2 aspect of
   * terminal character cells, and maps rotated line glyphs to the nearest of | / - \.
   */
  class TextRasterizer {
    static orient(char, rot) {
      const base = { '|': 0, '!': 0, '/': Math.PI / 4, '-': Math.PI / 2, '~': Math.PI / 2, '\\': -Math.PI / 4 }[char];
      if (base === undefined || !rot) return char;
      let a = (base + rot) % Math.PI;
      if (a < 0) a += Math.PI;
      const idx = Math.round(a / (Math.PI / 4)) % 4;
      if (char === '~' && idx === 2) return '~';
      if (char === '!' && idx === 0) return '!';
      return ['|', '/', '-', '\\'][idx];
    }

    static rasterize(glyphs, cols = 40, rows = 35, options = {}) {
      const aspect = options.aspect || 0.5; // cell width / cell height
      const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
      const visible = glyphs.filter(g => g.char && g.char.trim() !== '' && (g.alpha === undefined || g.alpha > 0.2));
      if (visible.length === 0) return grid.map(r => r.join('')).join('\n');

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      visible.forEach(g => {
        minX = Math.min(minX, g.x); maxX = Math.max(maxX, g.x);
        minY = Math.min(minY, g.y); maxY = Math.max(maxY, g.y);
      });
      const cellH = Math.max(options.minCell || 10, (maxY - minY + 1) / rows, (maxX - minX + 1) / (cols * aspect));
      const cellW = cellH * aspect;
      const offX = (cols * cellW - (maxX - minX)) / 2;
      const offY = rows * cellH - (maxY - minY) - cellH * 0.5; // sit on the bottom row

      visible.forEach(g => {
        const c = Math.floor((g.x - minX + offX) / cellW);
        const r = Math.floor((g.y - minY + offY) / cellH);
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          grid[r][c] = TextRasterizer.orient(g.char.length > 1 ? g.char[1] || g.char[0] : g.char, g.rot);
        }
      });
      return grid.map(r => r.join('').replace(/\s+$/, '')).join('\n');
    }
  }

  /**
   * Spatially coherent wind: gust fronts travel across the meadow so neighbouring plants
   * bend together and the wave visibly rolls from one side to the other.
   */
  class WindField {
    constructor(seed = 7) {
      this.noise = new SimplexNoise(seed);
    }
    sample(x, t) {
      return clamp(this.noise.fbm2(x * 0.0022 - t * 0.32, t * 0.07, 2) * 1.4, -1, 1);
    }
  }

  // =========================================================================
  // 7. LIVING MEADOW GRASS (LIFECYCLE: SPROUT -> GROW -> WILT -> DIE -> RESEED)
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

    generateGlyphs(time = 0, windStrength = 0.5, pointer = null, palette = null, gust = 0) {
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

      const windSway = (Math.sin(time * 2.4 + gx * 0.06) * (0.6 + 0.4 * Math.abs(gust)) + gust * 1.2) * (windStrength * 7);

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

          let prevX = bx;
          for (let s = 1; s <= steps; s++) {
            const st = s / steps;
            const sy = gy - (s * 8);
            const sway = (windSway + pointerDeflection) * st * st + (bCurve * st);
            const gl = stemGlyph(Math.atan2(bx + sway - prevX, 8));
            glyphs.push({
              x: bx + sway,
              y: sy,
              char: gl.char,
              fg: st > 0.5 ? colBlade : colBladeDark,
              size: Math.round(11 + st * 2),
              rot: gl.rot
            });
            prevX = bx + sway;
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

          let prevX = bx;
          let prevY = gy;
          for (let s = 1; s <= steps; s++) {
            const st = s / steps;
            const sy = gy - (s * 6) + (st * st * 8);
            const sway = (windSway * 0.35) * st + (droop * st);
            glyphs.push({
              x: bx + sway,
              y: sy,
              char: st > 0.75 ? "~" : stemGlyph(Math.atan2(bx + sway - prevX, Math.max(0.5, prevY - sy))).char,
              fg: st > 0.5 ? colStraw : colWilt,
              size: 11,
              rot: st > 0.75 ? 0 : stemGlyph(Math.atan2(bx + sway - prevX, Math.max(0.5, prevY - sy))).rot
            });
            prevX = bx + sway;
            prevY = sy;
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
  // 8. THE ASCIIPLANT CLASS
  // =========================================================================

  const SPECIES = ['sunflower', 'hibiscus', 'iris', 'thistle', 'marigold', 'daffodil', 'rose', 'dandelion', 'tulip', 'flytrap'];

  // Biological-age landmarks (in growth units n: 0 -> 1 grows, 1 -> 21 mature prime)
  const PRIME_END = 21.0;
  const LIFE_END = 23.5;
  const BASE_AGING_RATE = 0.025; // biological age per second at 1x for an average plant

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
      // Per-plant switches (a garden's options apply on top of these)
      this.growth = options.growth !== false;          // false: this plant never ages
      this.flowerCycles = options.flowerCycles !== false; // false: flowers stay in bloom

      this.simulator = new BotanicalSimulator({
        type: this.type,
        seed: this.seed,
        height: this.height,
        scale: this.scale,
        curvature: this.curvature,
        leafDensity: this.leafDensity,
        branching: this.branching,
        genome: options.genome
      });
      this.simulator.memberCycles = this.flowerCycles;
      // Metabolic rate is inherited (genome vigour) unless explicitly overridden
      this.metabolicRate = options.metabolicRate !== undefined ? options.metabolicRate : this.genome.vigor;

      this.pointer = { x: 0, y: 0, active: false };
      this.growthBoost = 0.0;
      this.vitality = 1.0;
      this.seedsBlown = false;
      this.seedRegenTimer = 0.0;
      this.clock = 0.0;
    }

    get genome() {
      return this.simulator.genome;
    }

    /** Replace (part of) the genome, e.g. from the Parametric Lab; keeps age & seed. */
    setGenome(traits) {
      const next = traits instanceof Genome ? traits : new Genome(Object.assign(this.genome.toJSON(), traits));
      this.simulator.applyGenome(next);
      this.metabolicRate = next.vigor;
    }

    /**
     * Fast-forward member subcycles (leaf unfurling, branch elongation) at the current
     * age, so a freshly (re)generated specimen appears as it would have grown.
     */
    settle(seconds = 12, step = 0.25) {
      for (let t = 0; t < seconds; t += step) this.simulator.updateMembers(step, 1.0, this.age);
      if (this.bloom !== null) this.setBloom(this.bloom);
    }

    /**
     * Regrow this individual from germination to targetAge by replaying its life at
     * normal speed (same growth noise, life factor and member subcycles as in a garden).
     * Deterministic for a given seed and genome, so scrubbing an age slider back and
     * forth always shows the same plant at the same age.
     */
    growTo(targetAge, step = 1.0) {
      targetAge = clamp(targetAge, 0.02, LIFE_END - 0.01);
      const sim = this.simulator;
      sim.rng = new PRNG((this.seed ^ 0x2545f491) >>> 0 || 1);
      sim.clock = 0;
      sim.initMembers();
      this.clock = 0;
      this.age = 0.02;
      for (let guard = 0; this.age < targetAge && guard < 20000; guard++) {
        this.age = Math.min(targetAge, this.age + this.agingDelta(step, 1.0));
        this.clock += step;
        sim.updateMembers(step, 1.0, this.age);
      }
      sim.seedRelease = 0;
      if (this.bloom !== null) this.setBloom(this.bloom);
    }

    feed(amount = 0.20) {
      this.growthBoost = Math.min(0.65, this.growthBoost + amount);
      this.vitality = Math.min(1.4, this.vitality + 0.2);
      this.simulator.feedMembers(amount);
    }

    update(dt, timeSpeed = 1.0) {
      this.clock += dt * timeSpeed;
      this.simulator.updateMembers(dt, timeSpeed, this.age);
    }

    /**
     * Biological age gained over dt seconds of garden time. Growth speed wanders with
     * noise; the life factor stretches the mature prime (long-lived individuals stay in
     * their prime for longer) without moving the biological landmarks themselves.
     */
    agingDelta(dt, timeSpeed = 1.0) {
      const longevity = (this.age >= 1.0 && this.age < PRIME_END) ? 1.0 / this.genome.lifeFactor : 1.0;
      return dt * timeSpeed * BASE_AGING_RATE * (this.metabolicRate || 1.0) * this.simulator.growthNoise(this.clock) * longevity;
    }

    /**
     * Restart this individual from a new seed. With { inherit: true } the new genome is a
     * mutated copy of the current one (self-seeding) instead of an unrelated random one.
     */
    reseed(newSeed = Math.floor(Math.random() * 1000000), options = {}) {
      const genome = options.genome || (options.inherit ? this.genome.mutate(newSeed) : Genome.random(this.type, newSeed));
      this.seed = newSeed;
      this.simulator.reseedGenetics(newSeed, genome);
      this.age = 0.04;
      this.bloom = null;
      this.metabolicRate = genome.vigor;
      this.growthBoost = 0.0;
      this.vitality = 1.0;
      this.seedsBlown = false;
      this.seedRegenTimer = 0.0;
      this.clock = 0.0;
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
      if (this.age > PRIME_END) {
        const sen = clamp((this.age - PRIME_END) / 2.5, 0.0, 1.0);
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

    /** This individual's colours: the base palette tinted by its genome. */
    getPalette() {
      return this.genome.tintPalette(PALETTES[this.paletteName] || PALETTES.botanical);
    }

    generateGlyphs(originX, groundY, time = 0, windStrength = 0.5, gust = 0) {
      let pointerDist = null;
      if (this.pointer.active && this.pointerMode !== 'none') {
        pointerDist = {
          dx: this.pointer.x - originX,
          dy: this.pointer.y - (groundY - this.height * 0.7),
          mode: this.pointerMode,
          strength: 1.0
        };
      }

      const pData = this.simulator.simulate(this.age, this.bloom, time, windStrength, pointerDist, gust);
      const palette = this.getPalette();
      return BotanicalArchitect.generatePlantGlyphs(pData, originX, groundY, palette, this.seed, time, this.seedsBlown);
    }

    /**
     * Render through the shared glyph atlas (rotated glyphs, no per-glyph font changes).
     * options.bloom adds a cheap downscaled glow pass over the whole canvas.
     */
    renderToCanvas(ctx, originX, groundY, time = 0, windStrength = 0.5, options = {}) {
      const glyphs = this.generateGlyphs(originX, groundY, time, windStrength, options.gust || 0);
      GlyphRenderer.shared.draw(ctx, glyphs);

      if (options.bloom && ctx && ctx.canvas) {
        if (!this._bloom) this._bloom = new BloomPass();
        this._bloom.apply(ctx, ctx.canvas.width, ctx.canvas.height);
      }
    }

    toPlainText(cols = 40, rows = 35) {
      const glyphs = this.generateGlyphs(0, 0, 0, 0);
      return TextRasterizer.rasterize(glyphs, cols, rows);
    }
  }

  /**
   * Screen-space glow: blur a 1/3-scale copy of the frame and add it back with 'lighter'.
   * One blur per frame regardless of glyph count (vs. thousands with shadowBlur).
   */
  class BloomPass {
    constructor() {
      this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    }

    /** width/height are the source canvas size in device pixels. */
    apply(ctx, width, height, strength = 1.0) {
      if (!this.ctx || !ctx || !ctx.canvas) return;
      const bw = Math.max(10, Math.floor(width / 3));
      const bh = Math.max(10, Math.floor(height / 3));
      if (this.canvas.width !== bw || this.canvas.height !== bh) {
        this.canvas.width = bw;
        this.canvas.height = bh;
      }
      const b = this.ctx;
      b.clearRect(0, 0, bw, bh);
      if (typeof b.filter !== 'undefined') b.filter = 'blur(2.5px)';
      b.drawImage(ctx.canvas, 0, 0, bw, bh);
      if (typeof b.filter !== 'undefined') b.filter = 'none';

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      // Tier 1: luminous inner core. Tier 2: soft atmospheric halo.
      ctx.globalAlpha = 0.38 * strength;
      ctx.drawImage(this.canvas, 0, 0, width, height);
      ctx.globalAlpha = 0.16 * strength;
      ctx.drawImage(this.canvas, -6, -6, width + 12, height + 12);
      ctx.restore();
    }
  }

  // =========================================================================
  // 9. THE ASCIIGARDEN CLASS (LIVING, SELF-SEEDING MEADOW)
  // =========================================================================

  /**
   * Every feature of a garden with its default. Each one can be passed when the garden is
   * created, set as a web-component attribute (kebab-case), or changed at runtime with
   * garden.set({ ... }).
   */
  const GARDEN_DEFAULTS = {
    // Look
    palette: 'botanical',    // botanical | phosphor | amber | cyberpunk | monochrome
    background: '#050508',   // any CSS colour, or 'transparent'
    glow: true,              // screen-space bloom glow
    glowStrength: 1.0,
    rotation: true,          // glyphs follow curves; false = classic upright ASCII
    grass: true,             // living grass along the soil
    soil: true,              // the dashed soil line
    groundOffset: 50,        // px from the bottom of the canvas to the soil line
    // Motion
    wind: 0.6,               // breeze strength (0 = still air)
    gusts: true,             // travelling gust fronts on top of the breeze
    reducedMotion: null,     // null = follow prefers-reduced-motion
    fps: 0,                  // frame-rate cap (0 = display refresh rate)
    pauseOffscreen: true,    // stop drawing while the canvas is scrolled out of view
    // Life
    growth: true,            // plants grow and age over time
    timeSpeed: 1.0,          // biological clock multiplier
    aging: true,             // false: plants reach their prime and stay there
    flowerCycles: true,      // false: flowers stay in bloom (no wilting, no seed heads)
    reproduction: true,      // spent flowers seed new plants; false: plants regrow in place
    immigration: true,       // occasional wind-blown seeds of new species
    variation: true,         // false: every plant is its species' canonical individual
    genome: null,            // default genome traits for new plants, e.g. { hue: 0.4 }
    seed: 42,                // master seed: plants added without a seed derive theirs from it
    // Interaction
    interactive: true,       // pointer reactions, pollen trail and dandelion blowing
    pointerMode: 'reach',    // reach | flinch | none
    pollen: true,            // pollen trail behind the pointer
    particles: true,         // falling petals and leaves
    dandelionBlow: true      // click/tap a seed clock to blow its seeds
  };

  /** Named bundles of options; anything passed explicitly still wins. */
  const PRESETS = {
    living: {},
    static: {
      growth: false, flowerCycles: false, wind: 0, gusts: false, particles: false, pollen: false,
      interactive: false, reproduction: false, immigration: false
    },
    calm: { wind: 0.2, gusts: false, particles: false, pollen: false, reproduction: false, immigration: false, timeSpeed: 0.5 },
    classic: { rotation: false, glow: false },
    minimal: { grass: false, soil: false, background: 'transparent', particles: false, pollen: false }
  };

  function normalizeGardenOptions(options = {}) {
    const out = {};
    // Legacy names
    if (options.bloom !== undefined && options.glow === undefined) out.glow = options.bloom !== false;
    if (options.lifecycle !== undefined && options.reproduction === undefined) out.reproduction = options.lifecycle !== 'respawn';
    for (const key in options) {
      if (options[key] !== undefined && Object.prototype.hasOwnProperty.call(GARDEN_DEFAULTS, key)) out[key] = options[key];
    }
    if (out.wind === false) out.wind = 0;
    if (out.wind === true) out.wind = GARDEN_DEFAULTS.wind;
    return out;
  }

  function resolveGardenOptions(options = {}) {
    const preset = (options.preset && PRESETS[options.preset]) || {};
    return Object.assign({}, GARDEN_DEFAULTS, preset, normalizeGardenOptions(options));
  }

  const GARDEN_EVENTS = { germinate: 'onSeedGerminate', death: 'onPlantDeath', reseed: 'onPlantReseed', blow: 'onDandelionBlow' };

  class AsciiGarden {
    constructor(canvas, options = {}) {
      this.canvas = typeof canvas === 'string' && typeof document !== 'undefined' ? document.querySelector(canvas) : canvas;
      this.ctx = this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
      this.plants = [];
      this.windTime = 0;
      this.wind = new WindField(options.windSeed || 7);
      this.particles = []; // Floating pollen, seeds, petals, sunlight motes
      this.isRunning = false;
      this.pointer = { x: -999, y: -999, active: false };
      this.renderer = options.renderer || GlyphRenderer.shared;
      this.bloomPass = new BloomPass();
      this._events = {};
      this._planted = 0;

      // Every feature switch (see GARDEN_DEFAULTS); applied to the fields below.
      // Lifecycle model (from `reproduction`):
      //  'reproduce' — flowers set seed, seeds drift and germinate in new spots,
      //                dead plants are removed: a self-sustaining population.
      //  'respawn'   — a dead plant is reborn in place (single-specimen embeds).
      this.options = resolveGardenOptions(options);
      this.seedGermination = options.seedGermination !== undefined ? options.seedGermination : 0.12;
      this.minSpacing = options.minSpacing !== undefined ? options.minSpacing : 28;
      this.maxPlants = options.maxPlants || null;   // default derived from width
      this.minPlants = options.minPlants !== undefined ? options.minPlants : null;
      this.maxSpeciesShare = options.maxSpeciesShare !== undefined ? options.maxSpeciesShare : 0.3;
      this._immigrationTimer = 20 + Math.random() * 20;

      // Legacy single-callback hooks (garden.on(...) is the event API)
      this.onDandelionBlow = null;
      this.onSeedGerminate = null;
      this.onPlantDeath = null;
      this.onPlantReseed = null;

      this.grass = [];
      this._applyOptions();

      this._listeners = [];
      this._setupEvents();
      this._observeVisibility();
      this.resize();
    }

    /** Push option values into the engine fields they control. */
    _applyOptions() {
      const o = this.options;
      this.windStrength = Math.max(0, +o.wind || 0);
      this.paletteName = PALETTES[o.palette] ? o.palette : 'botanical';
      this.bloom = !!o.glow;
      this.lifecycle = o.reproduction ? 'reproduce' : 'respawn';
      this.immigration = !!(o.immigration && o.reproduction);
      this.timeSpeed = Math.max(0, +o.timeSpeed || 0);
      this.enableGrass = !!o.grass;
      this.reducedMotion = (o.reducedMotion !== null && o.reducedMotion !== undefined)
        ? !!o.reducedMotion
        : (typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.plants.forEach(({ plant }) => this._applyPlantFeatures(plant));
    }

    _applyPlantFeatures(plant) {
      plant.simulator.memberCycles = this.options.flowerCycles && plant.flowerCycles !== false;
      plant.setPalette(this.paletteName);
    }

    /**
     * Change any options at runtime, e.g. garden.set({ wind: 0, glow: false }) or
     * garden.set({ preset: 'static' }). Returns the garden for chaining.
     */
    set(partial = {}) {
      const prev = this.options;
      const preset = (partial.preset && PRESETS[partial.preset]) || {};
      this.options = Object.assign({}, prev, preset, normalizeGardenOptions(partial));
      this._applyOptions();
      if (prev.grass !== this.options.grass || prev.soil !== this.options.soil ||
        prev.groundOffset !== this.options.groundOffset || prev.palette !== this.options.palette) {
        this.resize();
      }
      if (!this.isRunning) this.render();
      return this;
    }

    setOptions(partial) {
      return this.set(partial);
    }

    /** Subscribe to garden events: 'germinate', 'death', 'reseed', 'blow'. */
    on(name, fn) {
      (this._events[name] = this._events[name] || []).push(fn);
      return this;
    }

    off(name, fn) {
      if (this._events[name]) this._events[name] = fn ? this._events[name].filter(f => f !== fn) : [];
      return this;
    }

    _emit(name, ...args) {
      const legacy = GARDEN_EVENTS[name] && this[GARDEN_EVENTS[name]];
      if (typeof legacy === 'function') legacy.apply(this, args);
      (this._events[name] || []).forEach(fn => fn.apply(this, args));
    }

    _observeVisibility() {
      this._offscreen = false;
      if (!this.options.pauseOffscreen || typeof IntersectionObserver === 'undefined' ||
        !this.canvas || typeof Element === 'undefined' || !(this.canvas instanceof Element)) return;
      this._visibilityObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => { this._offscreen = !entry.isIntersecting; });
      });
      this._visibilityObserver.observe(this.canvas);
    }

    get groundY() {
      return (this.cssHeight || 600) - (this.options ? this.options.groundOffset : 50);
    }

    get capacity() {
      return this.maxPlants || clamp(Math.floor((this.cssWidth || 800) / 120), 4, 16);
    }

    get floor() {
      return this.minPlants !== null ? this.minPlants : clamp(Math.floor((this.cssWidth || 800) / 240), 2, 8);
    }

    resize() {
      if (!this.canvas) return;
      const rect = typeof this.canvas.getBoundingClientRect === 'function'
        ? this.canvas.getBoundingClientRect()
        : { width: this.canvas.width || 800, height: this.canvas.height || 600 };
      const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
      this.dpr = dpr;
      this.cssWidth = rect.width || 800;
      this.cssHeight = rect.height || 600;
      this.canvas.width = Math.round(this.cssWidth * dpr);
      this.canvas.height = Math.round(this.cssHeight * dpr);
      if (this.ctx && typeof this.ctx.setTransform === 'function') this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      else if (this.ctx && typeof this.ctx.scale === 'function') this.ctx.scale(dpr, dpr);

      // Plants placed by fraction (0..1) keep their relative position when resized
      this.plants.forEach(entry => {
        if (entry.fx !== null && entry.fx !== undefined) entry.x = entry.fx * this.cssWidth;
      });

      this._soilGlyphs = [];
      if (this.options.soil) {
        const soil = mixColor(this.getPalette().stemDark, '#000000', 0.45);
        for (let gx = 0; gx < this.cssWidth; gx += 16) {
          this._soilGlyphs.push({ x: gx, y: this.groundY + 12, char: '-', fg: soil, size: 12 });
        }
      }
      this._initGrass();
      if (this._static) this.render();
    }

    _initGrass() {
      this.grass = [];
      if (!this.enableGrass) return;
      const w = this.cssWidth || 800;
      const gy = this.groundY;
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

    _listen(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      this._listeners.push([target, type, fn, opts]);
    }

    _setupEvents() {
      if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
      const local = (clientX, clientY) => {
        const rect = typeof this.canvas.getBoundingClientRect === 'function' ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
        return { x: clientX - rect.left, y: clientY - rect.top };
      };

      const updatePointer = (clientX, clientY) => {
        if (!this.options.interactive) return;
        const p = local(clientX, clientY);
        this.pointer.x = p.x;
        this.pointer.y = p.y;
        this.pointer.active = true;

        if (this.options.pollen && Math.random() < 0.25) {
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
      };

      this._listen(this.canvas, 'mousemove', e => updatePointer(e.clientX, e.clientY));

      this._listen(this.canvas, 'mouseleave', () => {
        this.pointer.active = false;
      });

      // Touch events for mobile phones & tablets
      this._listen(this.canvas, 'touchstart', e => {
        if (e.touches && e.touches.length > 0) {
          const t = e.touches[0];
          updatePointer(t.clientX, t.clientY);
          const p = local(t.clientX, t.clientY);
          if (this.options.interactive && this.options.dandelionBlow) this.checkDandelionBlow(p.x, p.y);
        }
      }, { passive: true });

      this._listen(this.canvas, 'touchmove', e => {
        if (e.touches && e.touches.length > 0) {
          updatePointer(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      this._listen(this.canvas, 'touchend', () => {
        this.pointer.active = false;
      }, { passive: true });

      // Click to blow dandelion seeds if clicking near a dandelion head!
      this._listen(this.canvas, 'click', e => {
        const p = local(e.clientX, e.clientY);
        if (this.options.interactive && this.options.dandelionBlow) this.checkDandelionBlow(p.x, p.y);
      });

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        this._listen(window, 'resize', () => this.resize());
      }
    }

    /** Stop the loop and detach every listener (call when removing the canvas). */
    destroy() {
      this.stop();
      this._listeners.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
      this._listeners = [];
      if (this._visibilityObserver) this._visibilityObserver.disconnect();
    }

    /**
     * Check if a coordinate hits any blooming dandelion flower head
     */
    checkDandelionBlow(clickX, clickY) {
      let hit = false;
      const groundY = this.groundY;
      this.plants.forEach(({ x: plantX, plant }) => {
        if (plant.type === 'dandelion' && !plant.seedsBlown && plant.age < PRIME_END && plant.simulator.isSeedClock(plant.bloom, plant.effectiveBloom)) {
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
     * Dandelion seed blow off: releases 32 parachute seeds that swing and have 1/20 chance
     * to sprout! Each seed carries a mutated copy of the parent genome.
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
          parent: plant,
          swingPhase: Math.random() * Math.PI * 2,
          swingSpeed: 2.5 + Math.random() * 2.0
        });
      }

      this._emit('blow', plant, originX, originY);
    }

    /**
     * Release n seeds from a plant's flower head. They fall under gravity, drift with the
     * wind field, and may germinate where they land (see _landSeed).
     */
    releaseSeeds(plant, originX, count = 3) {
      const head = plant.getHeadPosition(originX, this.groundY);
      const pal = plant.getPalette();
      const fPal = pal.flowers[plant.type] || pal.flowers.sunflower;
      const color = fPal.core || fPal.inner || fPal.deep || fPal.calyx || '#c8a060';
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: head.x + (Math.random() - 0.5) * 24,
          y: head.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 2.4,
          vy: -Math.random() * 1.2,
          char: Math.random() < 0.5 ? '.' : ',',
          color,
          life: 1.0,
          decay: 0.0,
          isSeed: true,
          parent: plant,
          guaranteed: false
        });
      }
    }

    _canGerminateAt(x, type) {
      if (x < 30 || x > (this.cssWidth || 800) - 30) return false;
      if (this.plants.length >= this.capacity) return false;
      // Competition: no species may crowd out the rest of the meadow
      const sameSpecies = this.plants.filter(p => p.plant.type === type).length;
      if (type && sameSpecies >= Math.max(2, Math.ceil(this.capacity * this.maxSpeciesShare))) return false;
      return !this.plants.some(p => Math.abs(p.x - x) < this.minSpacing);
    }

    /** A wind-borne seed of a random species drifting in from the upwind edge. */
    spawnImmigrantSeed(species = SPECIES[Math.floor(Math.random() * SPECIES.length)]) {
      this.particles.push({
        x: -10,
        y: 60 + Math.random() * (this.groundY * 0.5),
        vx: 1.2 + Math.random() * 1.5,
        vy: 0.2,
        char: '*',
        color: '#e8e2c8',
        life: 1.0,
        decay: 0.0,
        isSeed: true,
        floaty: true,
        species,
        parent: null
      });
    }

    _landSeed(p) {
      const parent = p.parent;
      const chance = p.isDandelionSeed ? 0.05 : (p.floaty ? 0.6 : this.seedGermination);
      const needed = this.plants.length < this.floor;
      if (!(p.guaranteed || needed || Math.random() < chance)) return null;
      const x = clamp(p.x, 40, (this.cssWidth || 800) - 40);
      const type = parent ? parent.type : (p.species || 'dandelion');
      if (!this._canGerminateAt(x, type)) return null;

      const seed = Math.floor(Math.random() * 1000000);
      const seedling = this.addPlant(x, {
        type,
        age: 0.04,
        height: parent ? parent.height * (0.92 + Math.random() * 0.16) : (type === 'dandelion' ? 240 : 290) + Math.random() * 90,
        seed,
        genome: parent ? parent.genome.mutate(seed) : undefined,
        curvature: parent ? parent.curvature * 0.5 + (Math.random() - 0.5) * 0.3 : 0
      });
      this._emit('germinate', seedling, x);
      return seedling;
    }

    /**
     * Add a plant. x is in CSS pixels, or a fraction of the width (0 < x < 1, or '40%')
     * that follows resizes. Also accepts a single object: addPlant({ type, x, ... }).
     */
    addPlant(x, plantOptions = {}) {
      if (x !== null && typeof x === 'object') {
        plantOptions = x;
        x = plantOptions.x;
      }
      const o = this.options;
      let fx = null;
      if (x === undefined || x === null) fx = 0.5;
      else if (typeof x === 'string' && x.trim().endsWith('%')) fx = parseFloat(x) / 100;
      else if (typeof x === 'number' && x > 0 && x < 1) fx = x;
      const px = fx !== null ? fx * (this.cssWidth || 800) : +x;

      const type = plantOptions.type || 'sunflower';
      const seed = plantOptions.seed !== undefined
        ? plantOptions.seed
        : Math.floor(hash01(o.seed, this._planted) * 1000000);
      this._planted++;
      let genome = plantOptions.genome;
      if (!(genome instanceof Genome)) {
        const traits = Object.assign({}, o.genome || {}, genome || {});
        if (!o.variation) genome = Genome.canonical(type, seed, traits);
        else if (Object.keys(traits).length > 0) genome = traits;
      }

      const plant = new AsciiPlant(Object.assign({}, plantOptions, {
        type,
        seed,
        genome,
        pointerMode: plantOptions.pointerMode || o.pointerMode,
        palette: this.paletteName
      }));
      this._applyPlantFeatures(plant);
      this.plants.push({ x: px, fx, plant });
      if (this._static) this.render();
      return plant;
    }

    removePlant(plant) {
      const i = this.plants.findIndex(p => p.plant === plant);
      if (i >= 0) this.plants.splice(i, 1);
    }

    clear() {
      this.plants = [];
      this.particles = [];
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      let lastTime = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

      const loop = (now) => {
        if (!this.isRunning) return;
        const nowMs = now || (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const schedule = () => {
          if (typeof requestAnimationFrame === 'function') this._raf = requestAnimationFrame(loop);
        };
        // Off-screen: do no work at all; frame-rate cap: skip until the next slot
        const minFrame = this.options.fps > 0 ? 1000 / this.options.fps : 0;
        if (this._offscreen || (minFrame && nowMs - lastTime < minFrame - 1)) {
          if (this._offscreen) lastTime = nowMs;
          schedule();
          return;
        }
        // Clamp so a backgrounded tab does not fast-forward the simulation on return
        const dt = Math.min(0.1, Math.max(0, (nowMs - lastTime) / 1000));
        lastTime = nowMs;

        this.update(dt);
        this.render();

        if (typeof requestAnimationFrame === 'function') {
          this._raf = requestAnimationFrame(loop);
        }
      };

      if (typeof requestAnimationFrame === 'function') {
        this._raf = requestAnimationFrame(loop);
      }
    }

    stop() {
      this.isRunning = false;
      if (this._raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
      this._raf = null;
    }

    update(dt) {
      this.windTime += dt;
      const o = this.options;
      const groundY = this.groundY;
      const dead = [];
      const growing = o.growth && this.timeSpeed > 0;

      this.plants.forEach(({ plant, x }) => {
        // Continuous biological lifecycle:
        // Growth (0 -> 1) -> mature prime (1 -> 21, stretched by the life factor)
        // -> senescence (21 -> 23.5) -> death
        if (growing && plant.growth !== false) {
          let newAge = plant.age + plant.agingDelta(dt, this.timeSpeed);
          // aging: false -> plants reach their prime and stay there
          if (!o.aging) newAge = Math.min(newAge, Math.max(plant.age, PRIME_END - 0.05));

          if (newAge >= LIFE_END) {
            dead.push({ plant, x });
          } else {
            plant.setAge(newAge);
            plant.update(dt, this.timeSpeed);
          }

          // Spent flower heads set seed which drifts off to start new plants elsewhere
          const sim = plant.simulator;
          if (sim.seedRelease > 0) {
            if (this.lifecycle === 'reproduce') {
              this.releaseSeeds(plant, x, sim.seedRelease * (1 + Math.round(plant.genome.flowering)));
            }
            sim.seedRelease = 0;
          }
        }

        // Sunlight nourishment boost update
        if (plant.growthBoost > 0) {
          if (plant.age > PRIME_END) {
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

        if (o.particles && (isFlowerWilting || plant.age > PRIME_END) && Math.random() < 0.10) {
          const head = plant.getHeadPosition(x, groundY);
          const pal = plant.getPalette();
          const fPal = pal.flowers[plant.type] || pal.flowers.sunflower;
          this.particles.push({
            x: head.x + (Math.random() - 0.5) * 22,
            y: head.y + 8,
            vx: (Math.random() - 0.5) * 1.0 + (this.windStrength * 0.8),
            vy: 0.7 + Math.random() * 0.8,
            char: Math.random() < 0.5 ? '~' : "'",
            color: fPal.petal || fPal.outer || fPal.standard || '#ffd700',
            life: 1.0,
            decay: 0.012 + Math.random() * 0.008,
            spin: (Math.random() - 0.5) * 0.2
          });
        }

        if (o.particles && hasLeafWilting && Math.random() < 0.04) {
          this.particles.push({
            x: x + (Math.random() - 0.5) * 35,
            y: groundY - (plant.height * Math.random() * 0.6),
            vx: (Math.random() - 0.5) * 0.6 + (this.windStrength * 0.5),
            vy: 1.2 + Math.random() * 0.8,
            char: '~',
            color: '#bfa035',
            life: 1.0,
            decay: 0.015,
            spin: (Math.random() - 0.5) * 0.15
          });
        }
      });

      // End of life: the individual is gone. In 'reproduce' mode it scatters its last seeds
      // (at least one is guaranteed to take if the meadow is getting sparse); in 'respawn'
      // mode it is reborn in place from a mutated copy of its own genome.
      dead.forEach(({ plant, x }) => {
        if (this.lifecycle === 'respawn') {
          plant.reseed(Math.floor(Math.random() * 1000000), { inherit: true });
          this._emit('reseed', plant, x);
          return;
        }
        this.removePlant(plant);
        this._emit('death', plant, x);
        const before = this.particles.length;
        this.releaseSeeds(plant, x, 3 + Math.round(plant.genome.flowering * 2));
        if (this.plants.length < this.floor && this.particles.length > before) {
          this.particles[before].guaranteed = true;
        }
      });

      if (this.immigration && this.lifecycle === 'reproduce' && growing) {
        this._immigrationTimer -= dt * this.timeSpeed;
        if (this._immigrationTimer <= 0) {
          this._immigrationTimer = 25 + Math.random() * 25;
          if (this.plants.length < this.capacity) this.spawnImmigrantSeed();
        }
      }

      // Update particles (pollen, seeds, petals, sunlight motes)
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];

        if (p.isDandelionSeed || p.isSeed) {
          const gust = this.wind.sample(p.x, this.windTime);
          if (p.isDandelionSeed) {
            // Pendulum swinging motion on breeze
            p.x += p.vx + Math.sin(this.windTime * p.swingSpeed + p.swingPhase) * 1.4 + gust * this.windStrength * 0.8;
            // Float gently downward
            p.vy = lerp(p.vy, 0.75, dt * 2.0);
          } else if (p.floaty) {
            // Plumed wind-borne seed: rides the gusts and sinks slowly
            p.vx = lerp(p.vx, (1.0 + gust) * this.windStrength * 2.0 + 0.4, dt * 0.8);
            p.vy = lerp(p.vy, 0.55, dt * 0.5);
            p.x += p.vx;
            if (p.x > (this.cssWidth || 800) - 30) p.vx = -Math.abs(p.vx); // stays in the meadow
          } else {
            // Heavier seeds: gravity with air drag, pushed by gusts
            p.vx = lerp(p.vx, gust * this.windStrength * 2.2, dt * 1.5);
            p.vy = Math.min(2.6, p.vy + dt * 4.0);
            p.x += p.vx;
          }
          p.y += p.vy;

          if (p.y >= groundY) {
            this._landSeed(p);
            this.particles.splice(i, 1);
            continue;
          }
        } else {
          // Standard ambient particle
          p.x += p.vx + Math.sin(this.windTime * 2 + p.y * 0.02) * 0.5;
          p.y += p.vy;
          if (p.spin) p.rot = (p.rot || 0) + p.spin;
        }

        p.life -= p.decay;
        if (p.life <= 0 || p.x > this.cssWidth + 50 || p.x < -50 || p.y < -50 || p.y > this.cssHeight + 50) {
          this.particles.splice(i, 1);
        }
      }

      this.plants.forEach(({ plant }) => {
        plant.pointer.x = this.pointer.x;
        plant.pointer.y = this.pointer.y;
        plant.pointer.active = this.pointer.active && o.interactive;
      });

      // Living Meadow Grass Lifecycle update (grass stands still when growth is off)
      if (this.enableGrass && o.growth && this.grass.length > 0) {
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

    /** Every glyph of the current frame, in draw order (CSS-pixel coordinates). */
    collectGlyphs() {
      const out = this._soilGlyphs ? this._soilGlyphs.slice() : [];
      const wind = this.windStrength * (this.reducedMotion ? 0.25 : 1.0);
      const time = this.reducedMotion ? this.windTime * 0.4 : this.windTime;

      if (this.enableGrass && this.grass.length > 0) {
        const pal = this.getPalette();
        const pointer = this.options.interactive ? this.pointer : null;
        for (let i = 0; i < this.grass.length; i++) {
          const tuft = this.grass[i];
          const gust = this.options.gusts ? this.wind.sample(tuft.x, this.windTime) : 0;
          const glyphs = tuft.generateGlyphs(time, wind, pointer, pal, gust);
          for (let j = 0; j < glyphs.length; j++) out.push(glyphs[j]);
        }
      }

      const groundY = this.groundY;
      for (let i = 0; i < this.plants.length; i++) {
        const { x, plant } = this.plants[i];
        const gust = this.options.gusts ? this.wind.sample(x, this.windTime) : 0;
        const glyphs = plant.generateGlyphs(x, groundY, time, wind, gust);
        for (let j = 0; j < glyphs.length; j++) out.push(glyphs[j]);
      }

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        out.push({ x: p.x, y: p.y, char: p.char, fg: p.color, size: p.isDandelionSeed ? 14 : 12, alpha: p.isSeed ? 1 : clamp(p.life, 0, 1), rot: p.rot });
      }
      return out;
    }

    /**
     * Frame: background -> every glyph through the sprite atlas in one pass -> one
     * downscaled screen-space bloom pass over the whole canvas.
     */
    render() {
      const ctx = this.ctx;
      if (!ctx) return;
      const dpr = this.dpr || 1;
      if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const bg = this.options.background;
      if (!bg || bg === 'transparent') {
        if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
      } else {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
      }

      this.renderer.draw(ctx, this.collectGlyphs(), dpr, { rotate: this.options.rotation });

      if (this.bloom && this.canvas) {
        this.bloomPass.apply(ctx, this.canvas.width, this.canvas.height, this.options.glowStrength);
      }
    }
  }

  // =========================================================================
  // 10. TIME-ANCHORED PERSISTENT MEADOW ENGINE (t0 EPOCH & DETERMINISTIC GROWTH)
  // =========================================================================

  function deterministicGenSeed(seed, k) {
    if (!k) return seed;
    let h = (seed ^ (k * 2654435761)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) % 1000000;
  }

  function parseTimeSpeed(val) {
    if (typeof val === 'number') return val;
    if (!val) return 40 / 86400; // default to 24-hour real-time
    const s = String(val).toLowerCase().trim();
    if (s === '24h' || s === 'realtime-day' || s === 'day') return 40 / 86400;
    if (s === '3d' || s === 'realtime-3days') return 40 / (3 * 86400);
    if (s === '7d' || s === 'realtime-week' || s === 'week') return 40 / (7 * 86400);
    if (s === '30d' || s === 'realtime-month' || s === 'month') return 40 / (30 * 86400);
    if (s === '1h' || s === 'fast-hour' || s === 'hour') return 40 / 3600;
    if (s.endsWith('x')) return parseFloat(s) || 1.0;
    const parsed = parseFloat(s);
    return isNaN(parsed) ? 1.0 : parsed;
  }

  function encodeMeadowConfig(config) {
    try {
      const compact = {
        t0: typeof config.startTime === 'number' ? config.startTime : new Date(config.startTime || Date.now()).getTime(),
        spd: config.speed !== undefined ? config.speed : '24h',
        n: config.plantCount || 7,
        sp: config.species || ['sunflower', 'rose', 'tulip', 'dandelion', 'iris'],
        pal: config.palette || 'botanical',
        seed: config.seed !== undefined ? config.seed : 42,
        w: config.wind !== undefined ? config.wind : 0.6,
        gr: config.grass !== false ? 1 : 0
      };
      const json = JSON.stringify(compact);
      if (typeof btoa !== 'undefined') {
        return btoa(encodeURIComponent(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } else if (typeof Buffer !== 'undefined') {
        return Buffer.from(json).toString('base64url');
      }
      return encodeURIComponent(json);
    } catch (e) {
      return '';
    }
  }

  function decodeMeadowConfig(str) {
    try {
      let json = '';
      if (typeof atob !== 'undefined') {
        let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        json = decodeURIComponent(atob(b64));
      } else if (typeof Buffer !== 'undefined') {
        json = Buffer.from(str, 'base64url').toString('utf8');
      } else {
        json = decodeURIComponent(str);
      }
      const data = JSON.parse(json);
      return {
        startTime: data.t0,
        speed: data.spd,
        plantCount: data.n,
        species: data.sp,
        palette: data.pal,
        seed: data.seed,
        wind: data.w,
        grass: data.gr !== 0
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * createPersistentMeadow:
   * Instantiates an AsciiGarden that anchors to a starting timestamp t0.
   * Calculates the exact growth stage of each plant based on elapsed real-world time (Date.now() - t0).
   * Ensures identical plants are preserved across sessions and continue their biological journey!
   */
  function createPersistentMeadow(target, options = {}) {
    let config = { ...options };
    if (typeof options === 'string') {
      const decoded = decodeMeadowConfig(options);
      if (decoded) config = { ...decoded };
    } else if (options.config) {
      const decoded = decodeMeadowConfig(options.config);
      if (decoded) config = { ...decoded, ...options };
    }

    let canvas = target;
    if (typeof target === 'string' && typeof document !== 'undefined') {
      canvas = document.querySelector(target);
    }
    if (!canvas && typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
    }

    const startTime = typeof config.startTime === 'number'
      ? config.startTime
      : new Date(config.startTime || Date.now()).getTime();

    const speedVal = config.speed !== undefined ? config.speed : (config.timeSpeed || config.timescale || '24h');
    const effectiveSpeed = parseTimeSpeed(speedVal);
    const masterSeed = config.seed !== undefined ? config.seed : 42;
    const palette = config.palette || 'botanical';
    const wind = config.wind !== undefined ? config.wind : 0.6;
    const plantCount = Math.max(1, config.plantCount || 7);
    const speciesList = Array.isArray(config.species)
      ? config.species
      : (typeof config.species === 'string'
        ? config.species.split(',').map(s => s.trim()).filter(Boolean)
        : ['sunflower', 'rose', 'tulip', 'dandelion', 'iris', 'thistle', 'hibiscus']);

    const garden = new AsciiGarden(canvas, Object.assign({}, config, {
      wind,
      palette,
      timeSpeed: effectiveSpeed,
      grass: config.grass !== false,
      // The population is defined by syncToTime(), so plants regrow in place
      reproduction: false,
      immigration: false
    }));

    garden.isPersistent = true;
    garden.startTime = startTime;
    garden.effectiveSpeed = effectiveSpeed;
    garden.masterSeed = masterSeed;
    garden.persistentConfig = {
      ...config,
      startTime,
      speed: speedVal,
      plantCount,
      species: speciesList,
      seed: masterSeed
    };

    /**
     * Calculate and sync exact mathematical plant growth states to targetTimestamp
     */
    garden.syncToTime = function(targetTimestamp = Date.now()) {
      this.clear();
      const w = this.cssWidth || (this.canvas ? this.canvas.clientWidth : 800) || 800;
      const rng = new PRNG(masterSeed);

      const elapsedMs = Math.max(0, targetTimestamp - startTime);
      const elapsedSec = elapsedMs / 1000;
      const simSec = elapsedSec * effectiveSpeed;

      const plants = [];
      for (let i = 0; i < plantCount; i++) {
        const xFrac = (i + 0.5) / plantCount + rng.range(-0.03, 0.03);
        const xPos = Math.max(30, Math.min(w - 30, xFrac * w));
        const sp = speciesList[i % speciesList.length];
        const initialAge = 0.04 + rng.range(0.0, 0.04);
        const initialSeed = Math.floor(rng.range(1000, 999999));
        const metabolicRate = rng.range(0.85, 1.15);
        // Fit the canvas (flower heads and the genome's size gene need head-room)
        const height = Math.min(rng.range(270, 370), Math.max(80, ((this.cssHeight || 400) - 50) * 0.6));
        const curvature = rng.range(-0.35, 0.35);

        // Accumulated age in 20n lifecycle units (0 -> 1.0 growth, 1.0 -> 21.0 mature, 21.0 -> 23.5 senescence)
        const agingRatePerSec = 0.025 * metabolicRate;
        const totalAge = initialAge + (simSec * agingRatePerSec);

        const cycleLength = 23.5;
        const completedCycles = Math.floor(totalAge / cycleLength);
        const currentAge = totalAge % cycleLength;
        const currentSeed = deterministicGenSeed(initialSeed, completedCycles);

        const plant = this.addPlant(xPos, {
          type: sp,
          age: currentAge,
          height,
          curvature,
          seed: currentSeed,
          metabolicRate
        });

        // Sync member subcycles (flower anthesis flushes & leaf turnover)
        if (plant.simulator && plant.simulator.members) {
          const m = plant.simulator.members;
          // Flower subcycle flush sync
          if (m.apicalFlower) {
            const flower = m.apicalFlower;
            const waveTotal = flower.lifespan + flower.wiltTimer + flower.resproutTimer;
            if (currentAge < 1.0) {
              const bloomFrac = smoothstep(0.42, 0.88, currentAge);
              flower.bloom = bloomFrac;
              flower.state = currentAge > 0.45 ? 'blooming' : (currentAge > 0.18 ? 'opening' : 'bud');
            } else if (currentAge <= 21.0) {
              // Mature prime flushes initiate after vegetative maturity is achieved
              const timeToMature = Math.max(0, (1.0 - initialAge) / agingRatePerSec);
              const matureSimSec = Math.max(0, simSec - timeToMature);
              const phase = matureSimSec % waveTotal;
              if (phase < flower.lifespan) {
                flower.state = 'blooming';
                flower.bloom = 1.0;
              } else if (phase < flower.lifespan + flower.wiltTimer) {
                flower.state = 'wilting';
                flower.bloom = Math.max(0.2, 1.0 - (phase - flower.lifespan) / flower.wiltTimer);
              } else {
                flower.state = 'dormant';
                flower.bloom = 0.0;
              }
            } else {
              flower.state = 'wilting';
              flower.bloom = Math.max(0.0, 1.0 - (currentAge - 21.0) / 2.5);
            }
          }

          if (m.leaves && m.leaves.length > 0) {
            m.leaves.forEach((lf, lIdx) => {
              const leafTotal = (lf.lifespan || 22) + 6.0 + 8.0;
              const lPhase = (simSec + lIdx * 6.7) % leafTotal;
              if (currentAge < 0.3) {
                lf.state = 'bud';
              } else if (currentAge <= 21.0) {
                if (lPhase < (lf.lifespan || 22)) {
                  lf.state = 'mature';
                } else if (lPhase < (lf.lifespan || 22) + 6.0) {
                  lf.state = 'wilting';
                } else {
                  lf.state = 'dead';
                }
              } else {
                lf.state = 'wilting';
              }
              // Keep the drawn size consistent with the synced state
              if (lf.state !== 'bud') lf.maturity = 1.0;
              lf.isWilted = lf.state === 'wilting';
              lf.isDead = lf.state === 'dead';
            });
          }
        }

        plants.push({ plant, x: xPos, totalAge, completedCycles });
      }

      // Sync grass tufts
      if (this.grass && this.grass.length > 0) {
        this.grass.forEach((tuft) => {
          tuft.life = (tuft.life + simSec * 0.033) % 1.0;
        });
      }

      return plants;
    };

    garden.getMeadowSummary = function(targetTimestamp = Date.now()) {
      const elapsedMs = Math.max(0, targetTimestamp - startTime);
      const elapsedHours = (elapsedMs / (1000 * 3600)).toFixed(1);
      const elapsedDays = (elapsedMs / (1000 * 86400)).toFixed(2);
      const avgAge = this.plants.length > 0
        ? this.plants.reduce((sum, p) => sum + p.plant.age, 0) / this.plants.length
        : 0;
      let stage = 'Sprouting';
      if (avgAge > 21.0) stage = 'Senescence';
      else if (avgAge >= 1.0) stage = 'Mature Prime (Flourishing)';
      else if (avgAge > 0.45) stage = 'Blooming Anthesis';
      else if (avgAge > 0.15) stage = 'Vegetative Growth';

      return {
        elapsedMs,
        elapsedHours,
        elapsedDays,
        averageAge: parseFloat(avgAge.toFixed(2)),
        stage,
        plantCount: this.plants.length
      };
    };

    garden.fastForwardTo = function(targetTimestamp) {
      this.syncToTime(targetTimestamp);
    };

    // Initialize to current time & start live loop
    garden.syncToTime(Date.now());
    garden.start();

    return garden;
  }

  // =========================================================================
  // 11. ONE-LINE INTEGRATION HELPERS
  // =========================================================================

  // Options that describe a single plant (everything else is a garden option)
  const PLANT_KEYS = ['type', 'age', 'bloom', 'height', 'seed', 'genome', 'curvature', 'leafDensity',
    'branching', 'pointerMode', 'growth', 'flowerCycles', 'metabolicRate'];

  function pick(obj, keys) {
    const out = {};
    keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
    return out;
  }

  /** A selector, canvas or container element -> a canvas (created inside containers). */
  function resolveCanvas(target) {
    let el = (typeof target === 'string' && typeof document !== 'undefined') ? document.querySelector(target) : target;
    if (!el && typeof target === 'string') throw new Error(`Florametric: no element matches "${target}"`);
    if (el && typeof el.getContext !== 'function' && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block;';
      if (!el.style.height && el.clientHeight === 0) el.style.height = '360px';
      el.appendChild(canvas);
      el = canvas;
    }
    return el || null;
  }

  /** options.plants (strings or objects) or species + count -> plant specs with x fractions. */
  function plantSpecs(options) {
    let specs;
    if (Array.isArray(options.plants) && options.plants.length) {
      specs = options.plants.map(p => (typeof p === 'string' ? { type: p } : Object.assign({}, p)));
    } else {
      let species = options.species || SPECIES;
      if (typeof species === 'string') species = species.split(',').map(t => t.trim()).filter(Boolean);
      const count = options.count !== undefined ? Math.max(0, options.count | 0) : Math.min(species.length, 7);
      specs = [];
      for (let i = 0; i < count; i++) specs.push({ type: species[i % species.length] });
    }
    const shared = pick(options, ['age', 'bloom', 'height', 'curvature', 'growth', 'flowerCycles']);
    return specs.map((spec, i) => Object.assign({}, shared, { x: (i + 0.5) / specs.length }, spec));
  }

  /**
   * Tallest plant that fits the canvas with room for its flower head, allowing for the
   * genome's size gene (up to ~1.3x). Helpers never let a flower be cut off at the top.
   */
  function fitHeight(garden) {
    if (!garden.cssHeight) return 320;
    return clamp((garden.cssHeight - garden.options.groundOffset - 105) / 1.3, 60, 380);
  }

  /**
   * Plant a spec, then measure the grown plant's real top edge (the size gene and flower
   * heads vary) and replant it smaller, same seed and genome, if any glyph would be cut off.
   */
  function addFitted(garden, spec) {
    let plant = garden.addPlant(spec);
    if (!garden.cssHeight || plant.age < 1) return plant;
    const margin = 10;
    const groundY = garden.groundY;
    // Flower heads do not shrink with the stem, so a single proportional pass can fall short
    for (let pass = 0; pass < 3 && plant.height > 40; pass++) {
      const entry = garden.plants[garden.plants.length - 1];
      let top = Infinity;
      for (const g of plant.generateGlyphs(entry.x, groundY, 0, 0, 0)) top = Math.min(top, g.y - (g.size || 12) / 2);
      if (top >= margin) break;
      garden.removePlant(plant);
      garden._planted--;
      const scale = (groundY - margin) / Math.max(1, groundY - top);
      plant = garden.addPlant(Object.assign({}, spec, {
        seed: plant.seed, genome: plant.genome, height: Math.max(40, plant.height * scale * 0.95)
      }));
    }
    return plant;
  }

  /**
   * Florametric.garden(target, options): a garden of plants in one call.
   *   target  - selector, <canvas>, or any container element (a canvas is created inside)
   *   options - every garden option (GARDEN_DEFAULTS), plus
   *             plants: ['rose', { type: 'tulip', x: 0.7, age: 1 }] or species + count,
   *             age/bloom/height for all plants, animate: false (draw once), autoStart.
   */
  function createGarden(target, options = {}) {
    const garden = new AsciiGarden(resolveCanvas(target), options);
    const fit = fitHeight(garden);
    plantSpecs(options).forEach(spec => {
      spec.height = Math.min(spec.height !== undefined ? spec.height : fit, fit);
      addFitted(garden, spec);
    });
    if (options.animate === false) {
      garden._static = true;
      garden.render();
    } else if (options.autoStart !== false) {
      garden.start();
    }
    return garden;
  }

  /** Florametric.plant(target, options): one specimen, centred; plant + garden options. */
  function createPlant(target, options = {}) {
    const canvas = resolveCanvas(target);
    const garden = new AsciiGarden(canvas, Object.assign({ reproduction: false, immigration: false }, options));
    const plant = pick(options, PLANT_KEYS);
    if (plant.age === undefined) plant.age = 1.0;
    const fit = fitHeight(garden);
    plant.height = Math.min(plant.height !== undefined ? plant.height : fit, fit);
    addFitted(garden, Object.assign({ x: 0.5 }, plant));
    if (options.animate === false) {
      garden._static = true;
      garden.render();
    } else if (options.autoStart !== false) {
      garden.start();
    }
    return garden;
  }

  /** Florametric.render(target, options): draw once with the static preset (no CPU after). */
  function renderStatic(target, options = {}) {
    const many = options.plants || options.species || options.count !== undefined;
    const opts = Object.assign({ preset: 'static' }, options, { animate: false });
    return many ? createGarden(target, opts) : createPlant(target, opts);
  }

  // HTML attribute -> option type. Booleans accept "", true/false, 1/0, yes/no, on/off.
  const ATTRIBUTE_TYPES = {
    palette: 'str', background: 'str', glow: 'bool', 'glow-strength': 'num', rotation: 'bool',
    grass: 'bool', soil: 'bool', 'ground-offset': 'num', wind: 'num', gusts: 'bool',
    'reduced-motion': 'bool', fps: 'num', 'pause-offscreen': 'bool', growth: 'bool',
    'time-speed': 'num', aging: 'bool', 'flower-cycles': 'bool', reproduction: 'bool',
    immigration: 'bool', variation: 'bool', genome: 'json', interactive: 'bool',
    'pointer-mode': 'str', pollen: 'bool', particles: 'bool', 'dandelion-blow': 'bool',
    preset: 'str', animate: 'bool',
    type: 'str', age: 'num', bloom: 'num', height: 'num', seed: 'num', curvature: 'num',
    species: 'list', count: 'num', plants: 'list'
  };

  function parseAttributeValue(kind, raw) {
    if (raw === null || raw === undefined) return undefined;
    const v = String(raw).trim();
    switch (kind) {
      case 'bool': return !/^(false|0|no|off)$/i.test(v);
      case 'num': {
        if (/^(false|off|none)$/i.test(v)) return 0;
        const n = parseFloat(v);
        return isNaN(n) ? undefined : n;
      }
      case 'list': return v.split(',').map(t => t.trim()).filter(Boolean);
      case 'json': try { return JSON.parse(v); } catch (e) { return undefined; }
      default: return v;
    }
  }

  /** Read options from an element's attributes, or from a plain { 'kebab-name': value } object. */
  function optionsFromAttributes(source) {
    const out = {};
    const read = (name, value) => {
      const kind = ATTRIBUTE_TYPES[name];
      if (!kind) return;
      const parsed = parseAttributeValue(kind, value);
      if (parsed !== undefined) out[name.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = parsed;
    };
    if (source && typeof source.getAttributeNames === 'function') {
      source.getAttributeNames().forEach(n => read(n, source.getAttribute(n)));
    } else if (source) {
      Object.keys(source).forEach(n => read(n, source[n]));
    }
    return out;
  }

  // =========================================================================
  // 12. CUSTOM WEB COMPONENTS
  // =========================================================================

  if (typeof customElements !== 'undefined') {
    // Attributes that change what is planted rebuild the element; the rest toggle live
    const STRUCTURAL_ATTRS = ['type', 'age', 'bloom', 'height', 'seed', 'curvature', 'genome', 'species',
      'count', 'plants', 'start-time', 'epoch', 'speed', 'timescale', 'plant-count', 'config', 'variation', 'preset', 'animate'];

    class FlorametricElementBase extends HTMLElement {
      static get observedAttributes() {
        return Object.keys(ATTRIBUTE_TYPES).concat(['start-time', 'epoch', 'speed', 'timescale', 'plant-count', 'config']);
      }
      connectedCallback() {
        if (!this._garden) this._mount();
      }
      disconnectedCallback() {
        this._unmount();
      }
      attributeChangedCallback(name, oldValue, newValue) {
        if (!this._garden || oldValue === newValue) return;
        if (STRUCTURAL_ATTRS.includes(name)) {
          this._unmount();
          this._mount();
          return;
        }
        const camel = name.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
        const change = newValue === null
          ? { [camel]: GARDEN_DEFAULTS[camel] }
          : optionsFromAttributes({ [name]: newValue });
        this._garden.set(change);
        if (name === 'background') this._applyHostStyle(optionsFromAttributes(this));
      }
      /** The underlying AsciiGarden, for full JavaScript control. */
      get garden() {
        return this._garden || null;
      }
      set(options) {
        if (this._garden) this._garden.set(options);
        return this;
      }
      _canvas(label) {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:100%;display:block;';
        // ASCII art is decorative to screen readers; describe it once instead
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', this.getAttribute('aria-label') || label);
        this.appendChild(canvas);
        return canvas;
      }
      _applyHostStyle(opts) {
        const bg = opts.background || GARDEN_DEFAULTS.background;
        this.style.background = bg === 'transparent' ? 'transparent' : bg;
      }
      _unmount() {
        if (this._garden) this._garden.destroy();
        this._garden = null;
        this.innerHTML = '';
      }
    }

    /** <florametric-plant type="rose" ...>: one specimen; every option is an attribute. */
    class FlorametricPlantElement extends FlorametricElementBase {
      _mount() {
        const opts = optionsFromAttributes(this);
        const height = opts.height || 300;
        if (this.style.display === '' ) this.style.display = 'inline-block';
        this.style.width = this.style.width || '280px';
        this.style.height = this.style.height || `${height + 80}px`;
        this._applyHostStyle(opts);
        const canvas = this._canvas(`Animated ASCII ${opts.type || 'sunflower'} plant`);
        this._garden = createPlant(canvas, opts);
      }
    }

    /** <florametric-garden species="rose,tulip" count="6" ...>: a row of plants. */
    class FlorametricGardenElement extends FlorametricElementBase {
      _mount() {
        const opts = optionsFromAttributes(this);
        if (this.style.display === '') this.style.display = 'block';
        this.style.width = this.style.width || '100%';
        this.style.height = this.style.height || '360px';
        this._applyHostStyle(opts);
        const canvas = this._canvas('Animated ASCII flower garden');
        this._garden = createGarden(canvas, opts);
      }
    }

    if (!customElements.get('florametric-plant')) {
      customElements.define('florametric-plant', FlorametricPlantElement);
    }
    if (!customElements.get('ascii-plant')) {
      class AsciiPlantElement extends FlorametricPlantElement { }
      customElements.define('ascii-plant', AsciiPlantElement);
    }
    if (!customElements.get('florametric-garden')) {
      customElements.define('florametric-garden', FlorametricGardenElement);
    }
    /**
     * <florametric-meadow>: Drop-in Time-Anchored Persistent Garden Element
     */
    class FlorametricMeadowElement extends FlorametricElementBase {
      _mount() {
        const startTimeAttr = this.getAttribute('start-time') || this.getAttribute('epoch');
        const startTime = startTimeAttr
          ? (isNaN(Number(startTimeAttr)) ? new Date(startTimeAttr).getTime() : Number(startTimeAttr))
          : Date.now();
        const speed = this.getAttribute('speed') || this.getAttribute('timescale') || '24h';
        const plantCount = parseInt(this.getAttribute('plant-count') || this.getAttribute('plants-count') || '7', 10);
        const speciesAttr = this.getAttribute('species') || this.getAttribute('plants');
        const species = speciesAttr ? speciesAttr.split(',').map(s => s.trim()).filter(Boolean) : null;
        const palette = this.getAttribute('palette') || 'botanical';
        const wind = parseFloat(this.getAttribute('wind') || '0.6');
        const grass = this.getAttribute('grass') !== 'false';
        const seed = parseInt(this.getAttribute('seed') || '42', 10);
        const configAttr = this.getAttribute('config');

        const features = optionsFromAttributes(this);
        if (this.style.display === '') this.style.display = 'block';
        this.style.width = this.style.width || '100%';
        this.style.height = this.style.height || '360px';
        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this._applyHostStyle(features);

        const canvas = this._canvas('Time-anchored ASCII flower meadow');

        const meadowGarden = createPersistentMeadow(canvas, {
          ...features,
          startTime,
          speed,
          plantCount,
          species,
          palette,
          wind,
          grass,
          seed,
          config: configAttr
        });
        this._garden = meadowGarden;
      }

      fastForward(targetTimestamp) {
        if (this._garden) this._garden.fastForwardTo(targetTimestamp);
      }

      getSummary() {
        return this._garden ? this._garden.getMeadowSummary() : null;
      }
    }

    if (!customElements.get('florametric-meadow')) {
      customElements.define('florametric-meadow', FlorametricMeadowElement);
    }
    if (!customElements.get('ascii-meadow')) {
      class AsciiMeadowElement extends FlorametricMeadowElement { }
      customElements.define('ascii-meadow', AsciiMeadowElement);
    }
  }

  return {
    AsciiPlant,
    AsciiGarden,
    GrassTuft,
    Genome,
    BotanicalSimulator,
    BotanicalArchitect,
    ProceduralFlowerRenderer,
    GlyphRenderer,
    GlyphAtlas,
    TextRasterizer,
    WindField,
    SimplexNoise,
    PRNG,
    createPersistentMeadow,
    encodeMeadowConfig,
    decodeMeadowConfig,
    parseTimeSpeed,
    deterministicGenSeed,
    PALETTES,
    TRAIT_RANGES,
    BOTANY,
    SPECIES,
    // One-line integration
    garden: createGarden,
    plant: createPlant,
    render: renderStatic,
    presets: PRESETS,
    defaults: GARDEN_DEFAULTS,
    optionsFromAttributes,
    version: '2.0.0',
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
export const Genome = _FM ? _FM.Genome : null;
export const Florametric = _FM;
export const garden = _FM ? _FM.garden : null;
export const plant = _FM ? _FM.plant : null;
export const presets = _FM ? _FM.presets : null;
export const defaults = _FM ? _FM.defaults : null;
export const PALETTES = _FM ? _FM.PALETTES : null;
export const SPECIES = _FM ? _FM.SPECIES : null;
export default _FM;
