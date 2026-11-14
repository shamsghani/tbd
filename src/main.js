import { CakeScene } from './cakeScene.js';
import { HologramViewer } from './hologramViewer.js';
import { MicBlowDetector } from './micBlowDetector.js';
import { fireGrandCelebration, fireSideCannons } from './confetti.js';
import { MEMORIES } from './memoriesData.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const stageLock = document.getElementById('stage-lock');
  const lockForm = document.getElementById('lock-form');
  const lockInput = document.getElementById('lock-input');
  const lockError = document.getElementById('lock-error');
  const lockCard = document.getElementById('lock-card');
  const btnUnlock = document.getElementById('btn-unlock');

  const stageEnvelope = document.getElementById('stage-envelope');
  const envelopeTrigger = document.getElementById('envelope-trigger');
  const waxSeal = document.getElementById('wax-seal');

  // Pure JavaScript SHA-256 fallback (ensures offline / non-HTTPS mobile reliability)
  function fallbackSha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = [];
    const k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength) | 0;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = [...hash];
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0
          );
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash.slice(0, 7));
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }
    for (let i = 0; i < 8; i++) {
      for (let i2 = 3; i2 >= 0; i2--) {
        const c = (hash[i] >> (i2 * 8)) & 255;
        result += ((c < 16) ? '0' : '') + c.toString(16);
      }
    }
    return result;
  }

  // Cryptographic Salted SHA-256 Hash Verification (SubtleCrypto with Pure JS fallback)
  async function verifyPasscode(input) {
    const salt = 'tehrim_2026_special_salt';
    const targetHash = '6611940ee27f85634476aa1e80b16ea22685e84271cd4b27deeb000a61e3e43e';
    const normalized = `${salt}:${input.trim().toLowerCase()}`;

    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
        const msgBuffer = new TextEncoder().encode(normalized);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex === targetHash;
      }
    } catch (err) {
      console.warn('SubtleCrypto error, falling back to pure JS hash:', err);
    }
    return fallbackSha256(normalized) === targetHash;
  }

  const lockInputView = document.getElementById('lock-input-view');
  const lockCountdownView = document.getElementById('lock-countdown-view');
  const lockSubhint = document.getElementById('lock-subhint');
  const lockStarIcon = document.getElementById('lock-star-icon');

  const cdDays = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMins = document.getElementById('cd-mins');
  const cdSecs = document.getElementById('cd-secs');

  // Date Check: Unlocks November 21st, 2026 (midnight local time)
  const UNLOCK_DATE = new Date(2026, 10, 21, 0, 0, 0);

  // Hidden override / preview mode (?preview=true or triple-tap the ✦ star)
  let previewBypass = false;
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('preview') || urlParams.has('test') || urlParams.has('override')) {
    previewBypass = true;
  }

  const isUnlockedDate = () => {
    if (previewBypass) return true;
    const now = new Date();
    return now >= UNLOCK_DATE;
  };

  let countdownInterval = null;
  const startCountdownTimer = () => {
    if (countdownInterval) clearInterval(countdownInterval);

    const update = () => {
      const now = new Date();
      const diff = UNLOCK_DATE - now;

      if (diff <= 0) {
        clearInterval(countdownInterval);
        unlockSite();
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      if (cdDays) cdDays.textContent = String(days).padStart(2, '0');
      if (cdHours) cdHours.textContent = String(hours).padStart(2, '0');
      if (cdMins) cdMins.textContent = String(mins).padStart(2, '0');
      if (cdSecs) cdSecs.textContent = String(secs).padStart(2, '0');
    };

    update();
    countdownInterval = setInterval(update, 1000);
  };

  // Pre-calculate countdown values immediately
  startCountdownTimer();

  const showCountdown = () => {
    sessionStorage.setItem('tehrim_auth', 'true');
    if (lockInputView) lockInputView.classList.add('hidden');
    if (lockCountdownView) lockCountdownView.classList.remove('hidden');
    startCountdownTimer();
  };

  // Triple-tap ✦ star bypass for testing on any device
  let starTaps = 0;
  let starTimer = null;
  if (lockStarIcon) {
    lockStarIcon.style.cursor = 'pointer';
    lockStarIcon.addEventListener('click', () => {
      starTaps++;
      clearTimeout(starTimer);
      if (starTaps >= 3) {
        previewBypass = true;
        if (lockSubhint) {
          lockSubhint.textContent = 'preview mode active ✨';
          lockSubhint.style.color = '#ffc87a';
        }
        if (sessionStorage.getItem('tehrim_auth') === 'true') {
          unlockSite();
        }
      } else {
        starTimer = setTimeout(() => { starTaps = 0; }, 1000);
      }
    });
  }

  const unlockSite = () => {
    sessionStorage.setItem('tehrim_auth', 'true');
    stageLock.classList.add('hidden');
    stageEnvelope.classList.remove('hidden');
  };

  // Check if already authenticated during this session
  if (sessionStorage.getItem('tehrim_auth') === 'true') {
    if (isUnlockedDate()) {
      stageLock.classList.add('hidden');
      stageEnvelope.classList.remove('hidden');
    } else {
      showCountdown();
    }
  }

  const handleUnlockAttempt = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const val = lockInput.value;
    if (!val) return;

    try {
      const isMatch = await verifyPasscode(val);
      if (isMatch) {
        if (isUnlockedDate()) {
          unlockSite();
        } else {
          showCountdown();
        }
      } else {
        lockError.textContent = 'incorrect secret word';
        lockCard.classList.remove('shake-anim');
        void lockCard.offsetWidth; // re-trigger animation
        lockCard.classList.add('shake-anim');
        lockInput.value = '';
        lockInput.focus();
      }
    } catch (err) {
      console.error('Unlock verification error:', err);
      // Even if an unexpected error occurs, attempt fallback directly
      if (fallbackSha256(`tehrim_2026_special_salt:${val.trim().toLowerCase()}`) === '6611940ee27f85634476aa1e80b16ea22685e84271cd4b27deeb000a61e3e43e') {
        if (isUnlockedDate()) {
          unlockSite();
        } else {
          showCountdown();
        }
      }
    }
  };

  if (lockForm) {
    lockForm.addEventListener('submit', handleUnlockAttempt);
  }
  if (btnUnlock) {
    btnUnlock.addEventListener('click', handleUnlockAttempt);
    btnUnlock.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleUnlockAttempt(e);
    });
  }
  if (lockInput) {
    lockInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlockAttempt(e);
      }
    });
  }

  const stageLetter = document.getElementById('stage-letter');
  const btnCloseLetter = document.getElementById('btn-close-letter');

  const stageCake = document.getElementById('stage-cake');
  const bgVideoWrap = document.getElementById('bg-video-wrap');
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

    // Reveal video montage smoothly behind cake and memories
    if (bgVideoWrap) {
      bgVideoWrap.classList.add('active');
    }
    if (cakeMontageVideo) {
      if (!cakeMontageVideo.src.includes('montage.mp4')) {
        cakeMontageVideo.src = './montage.mp4';
      }
      cakeMontageVideo.play().catch(e => console.log('Video play error:', e));
    }

    // Reveal cake stage
    setTimeout(() => {
      stageCake.classList.remove('hidden');

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
            <img src="${mem.photo}" alt="${mem.date}" loading="lazy">
          </div>
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
