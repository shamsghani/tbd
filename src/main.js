import { CakeScene } from './cakeScene.js';
import { HologramViewer } from './hologramViewer.js';
import { MicBlowDetector } from './micBlowDetector.js';
import { fireGrandCelebration, fireSideCannons } from './confetti.js';
import { MEMORIES } from './memoriesData.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const stageEnvelope = document.getElementById('stage-envelope');
  const envelopeTrigger = document.getElementById('envelope-trigger');
  const waxSeal = document.getElementById('wax-seal');

  const stageLetter = document.getElementById('stage-letter');
  const btnCloseLetter = document.getElementById('btn-close-letter');

  const stageCake = document.getElementById('stage-cake');
  const cakeMontageVideo = document.getElementById('cake-montage-video');
  const cakeCenterpiece = document.getElementById('cake-centerpiece');
  const cakeCanvas = document.getElementById('cake-canvas');

  const stagePolaroids = document.getElementById('stage-polaroids');
  const fairyWall = document.getElementById('fairy-wall');

  const modalHologram = document.getElementById('modal-hologram-zoom');
  const hologramCard = document.getElementById('hologram-polaroid-card');
  const hologramViewport = document.getElementById('hologram-viewport');
  const hologramCaption = document.getElementById('hologram-caption');
  const hologramDate = document.getElementById('hologram-date');
  const btnCloseHologram = document.getElementById('btn-close-hologram');

  // Background Audio Setup (Olivia Dean - I've Seen It)
  const bgMusic = new Audio('./music.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.65;
  let hasMusicStarted = false;

  const startMusic = () => {
    if (!hasMusicStarted) {
      bgMusic.play().then(() => {
        hasMusicStarted = true;
      }).catch(err => console.log('Audio autoplay prevented:', err));
    }
  };

  // 3D Gaussian Splat & Spatial Hologram Viewer for Polaroid Zoom
  const hologramViewer = new HologramViewer(hologramViewport, hologramCard);

  // Microphone Blow Detection
  let micDetector = null;

  // Request iOS permissions immediately upon direct user touch
  const requestSensors = () => {
    // 1. iOS DeviceOrientation permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(res => console.log('DeviceOrientation permission:', res))
        .catch(err => console.log('DeviceOrientation err:', err));
    }

    // 2. Microphone access for blowing out the candle
    if (!micDetector) {
      micDetector = new MicBlowDetector(() => {
        if (cakeScene && !cakeScene.isBlownOut) {
          cakeScene.blowOut();
        }
      });
      micDetector.start();
    }
  };

  // STAGE 1: TAP WAX SEAL / ENVELOPE
  const handleOpenEnvelope = () => {
    startMusic();
    requestSensors();

    envelopeTrigger.classList.add('open');

    setTimeout(() => {
      stageEnvelope.classList.add('hidden');
      stageLetter.classList.remove('hidden');
    }, 850);
  };

  waxSeal.addEventListener('click', handleOpenEnvelope);
  waxSeal.addEventListener('touchend', handleOpenEnvelope, { passive: true });
  envelopeTrigger.addEventListener('click', handleOpenEnvelope);

  // STAGE 2: CLOSE LETTER -> REVEAL 3D CAKE & VIDEO MONTAGE
  let cakeScene = null;

  btnCloseLetter.addEventListener('click', () => {
    requestSensors();
    stageLetter.classList.add('hidden');

    // Reveal cake stage
    setTimeout(() => {
      stageCake.classList.remove('hidden');

      // Start looping video montage
      cakeMontageVideo.src = './montage.mp4';
      cakeMontageVideo.play().catch(() => {});

      // Initialize Three.js 3D Birthday Cake
      if (!cakeScene) {
        cakeScene = new CakeScene(cakeCanvas, handleCandleBlowOut);
      }

      // Activate microphone listener for breath/blow
      if (micDetector) {
        micDetector.start();
      }
    }, 400);
  });

  // STAGE 3: BLOW OUT CANDLE -> CAKE FADES -> FAIRY LIGHT POLAROID WALL
  const handleCandleBlowOut = () => {
    if (micDetector) {
      micDetector.stop();
    }

    fireGrandCelebration();
    setTimeout(() => fireSideCannons(), 300);

    setTimeout(() => {
      cakeCenterpiece.classList.add('fade-out');
    }, 1100);

    setTimeout(() => {
      stageCake.classList.add('hidden');
      stagePolaroids.classList.remove('hidden');
      // Enable natural smooth vertical scrolling on the document
      document.documentElement.style.overflowY = 'auto';
      document.body.style.overflowY = 'auto';
      window.scrollTo(0, 0);
    }, 1900);
  };

  // STAGE 4: BUILD FAIRY LIGHT CLOTHESLINE WALL (3 STRINGS, 15 POLAROIDS)
  const rows = [
    MEMORIES.slice(0, 5),
    MEMORIES.slice(5, 10),
    MEMORIES.slice(10, 15)
  ];

  const tilts = [-3.5, 2.5, -2, 3.2, -2.8];

  rows.forEach((rowMemories, rIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'fairy-string-row';

    // Glowing string wire
    const wireEl = document.createElement('div');
    wireEl.className = 'fairy-wire-line';
    rowEl.appendChild(wireEl);

    // Glowing light bulbs
    const bulbsEl = document.createElement('div');
    bulbsEl.className = 'fairy-bulbs-container';
    for (let b = 0; b < 8; b++) {
      const bulb = document.createElement('div');
      bulb.className = 'fairy-bulb';
      bulbsEl.appendChild(bulb);
    }
    rowEl.appendChild(bulbsEl);

    // Track of polaroids clipped with clothespins
    const trackEl = document.createElement('div');
    trackEl.className = 'hanging-polaroids-track';

    rowMemories.forEach((mem, mIndex) => {
      const item = document.createElement('div');
      item.className = 'hanging-polaroid';
      const rot = tilts[(rIndex * 2 + mIndex) % tilts.length];
      item.style.setProperty('--rot', `${rot}deg`);

      item.innerHTML = `
        <div class="clothespin"></div>
        <div class="polaroid-frame">
          <div class="polaroid-photo-wrap">
            <img src="${mem.photo}" alt="${mem.title}" loading="lazy">
          </div>
          <div class="polaroid-caption">${mem.title}</div>
          <div class="polaroid-date">${mem.date}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        openHologramModal(mem);
      });

      trackEl.appendChild(item);
    });

    rowEl.appendChild(trackEl);
    fairyWall.appendChild(rowEl);
  });

  // STAGE 5: OPEN HOLOGRAPHIC 3D ZOOM MODAL
  const openHologramModal = (mem) => {
    hologramCaption.textContent = mem.title;
    hologramDate.textContent = mem.date;
    hologramViewer.loadMemory(mem.photo, mem.depth);
    modalHologram.classList.add('active');
    document.body.style.overflow = 'hidden'; // lock background scroll while modal open
  };

  const closeHologramModal = () => {
    modalHologram.classList.remove('active');
    document.body.style.overflow = 'auto'; // restore natural scrolling
    if (hologramCard) {
      hologramCard.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(0.92)';
    }
  };

  modalHologram.addEventListener('click', (e) => {
    if (e.target === modalHologram || e.target === btnCloseHologram) {
      closeHologramModal();
    }
  });

  btnCloseHologram.addEventListener('click', closeHologramModal);
});
