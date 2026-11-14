import { CakeScene } from './cakeScene.js';
import { HologramViewer } from './hologramViewer.js';
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
  const polaroidScatterList = document.getElementById('polaroid-scatter-list');

  const modalHologram = document.getElementById('modal-hologram-zoom');
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

  // 3D Hologram Viewer for Polaroid Zoom
  const hologramViewer = new HologramViewer(hologramViewport);

  // STAGE 1: TAP ENVELOPE / WAX SEAL
  const handleOpenEnvelope = () => {
    startMusic();

    // Request iOS orientation permission early on user gesture
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }

    envelopeTrigger.classList.add('open');

    setTimeout(() => {
      stageEnvelope.classList.add('hidden');
      stageLetter.classList.remove('hidden');
    }, 850);
  };

  waxSeal.addEventListener('click', handleOpenEnvelope);
  envelopeTrigger.addEventListener('click', handleOpenEnvelope);

  // STAGE 2: CLOSE LETTER -> REVEAL 3D CAKE & VIDEO MONTAGE
  let cakeScene = null;

  btnCloseLetter.addEventListener('click', () => {
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
    }, 400);
  });

  // STAGE 3: BLOW OUT CANDLE -> CAKE FADES -> POLAROID SCATTER
  const handleCandleBlowOut = () => {
    fireGrandCelebration();
    setTimeout(() => fireSideCannons(), 300);

    setTimeout(() => {
      cakeCenterpiece.classList.add('fade-out');
    }, 1100);

    setTimeout(() => {
      stageCake.classList.add('hidden');
      stagePolaroids.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1900);
  };

  // STAGE 4: BUILD SCATTERED POLAROID GRID
  const rotations = [-4, 3, -2, 5, -3];

  MEMORIES.forEach((mem, index) => {
    const item = document.createElement('div');
    item.className = 'scatter-item';
    const rot = rotations[index % rotations.length];
    item.style.setProperty('--rot', `${rot}deg`);

    item.innerHTML = `
      <div class="scatter-photo-wrap">
        <img src="${mem.photo}" alt="${mem.title}" loading="lazy">
      </div>
      <div class="scatter-caption">${mem.title}</div>
      <div class="scatter-date">${mem.date}</div>
    `;

    item.addEventListener('click', () => {
      openHologramModal(mem);
    });

    polaroidScatterList.appendChild(item);
  });

  // STAGE 5: OPEN HOLOGRAPHIC ZOOM MODAL
  const openHologramModal = (mem) => {
    hologramCaption.textContent = mem.title;
    hologramDate.textContent = mem.date;
    hologramViewer.loadMemory(mem.photo, mem.depth);
    modalHologram.classList.add('active');
  };

  const closeHologramModal = () => {
    modalHologram.classList.remove('active');
  };

  modalHologram.addEventListener('click', (e) => {
    // If clicked on backdrop or close hint, close modal
    if (e.target === modalHologram || e.target === btnCloseHologram) {
      closeHologramModal();
    }
  });

  btnCloseHologram.addEventListener('click', closeHologramModal);
});
