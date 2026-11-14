import confetti from 'canvas-confetti';

/**
 * Birthday Confetti Cannons & Fireworks
 */
export function fireGrandCelebration() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    colors: ['#ff6b8b', '#ffd1dc', '#ffd700', '#f8dfc2', '#a0e7e5', '#b4f8c8']
  };

  function fire(particleRatio, opts) {
    confetti(Object.assign({}, defaults, opts, {
      particleCount: Math.floor(count * particleRatio)
    }));
  }

  // Multi-stage burst
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, {
    spread: 60,
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
}

export function fireSideCannons() {
  const end = Date.now() + 1.2 * 1000;
  const colors = ['#ff6b8b', '#ffd700', '#f9a8d4'];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: colors
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: colors
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
}

