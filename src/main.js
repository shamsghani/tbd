import { CakeScene } from './cakeScene.js';
import { HologramViewer } from './hologramViewer.js';
import { MicBlowDetector } from './micBlowDetector.js';
import { fireGrandCelebration, fireSideCannons } from './confetti.js';
import { MEMORIES } from './memoriesData.js';
import { CountdownMeadow } from './countdownMeadow.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const stageLock = document.getElementById('stage-lock');
  const meadowCanvas = document.getElementById('meadow-canvas');
  let countdownMeadow = null;
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
  const SALT = 'tehrim_2026_special_salt';
  const TARGET_HASH = 'f7696fc1d8c8b7e08ee5574aa5c6d6eedb4790fcdd4706c3427856c2eb747de1'; // 5000155 (date-gated)
  const MASTER_HASH = '48385dbb8253ea8ff71cca8af4b5a1723aebe7ded3ae12e106902016e063039b'; // secret master bypass (skips countdown)

  async function computeHash(input) {
    const normalized = `${SALT}:${input.trim().toLowerCase()}`;

    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
        const msgBuffer = new TextEncoder().encode(normalized);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (err) {
      console.warn('SubtleCrypto error, falling back to pure JS hash:', err);
    }
    return fallbackSha256(normalized);
  }

  const lockInputView = document.getElementById('lock-input-view');
  const lockCountdownView = document.getElementById('lock-countdown-view');
  const lockPermissionView = document.getElementById('lock-permission-view');
  const btnGrantPermissions = document.getElementById('btn-grant-permissions');
  const lockStarIcon = document.getElementById('lock-star-icon');

  const cdDays = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMins = document.getElementById('cd-mins');
  const cdSecs = document.getElementById('cd-secs');

  // Date Check: Unlocks November 22nd, 2026 (midnight local time)
  const UNLOCK_DATE = new Date(2026, 10, 22, 0, 0, 0);

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

  const unlockSite = () => {
    sessionStorage.setItem('tehrim_auth', 'true');
    stageLock.classList.add('hidden');
    stageEnvelope.classList.remove('hidden');
    if (countdownMeadow) {
      countdownMeadow.destroy();
      countdownMeadow = null;
    }
  };

  const showPermissionView = () => {
    sessionStorage.setItem('tehrim_auth', 'true');
    // If permissions have already been granted in this session, skip straight to envelope
    if (sessionStorage.getItem('sensors_granted') === 'true') {
      unlockSite();
      return;
    }
    if (lockInputView) lockInputView.classList.add('hidden');
    if (lockCountdownView) lockCountdownView.classList.add('hidden');
    if (lockPermissionView) lockPermissionView.classList.remove('hidden');
  };

  const showCountdown = () => {
    sessionStorage.setItem('tehrim_auth', 'true');
    if (lockInputView) lockInputView.classList.add('hidden');
    if (lockPermissionView) lockPermissionView.classList.add('hidden');
    if (lockCountdownView) lockCountdownView.classList.remove('hidden');
    startCountdownTimer();
  };

  let countdownInterval = null;
  const startCountdownTimer = () => {
    if (countdownInterval) clearInterval(countdownInterval);

    const update = () => {
      const now = new Date();
      const diff = UNLOCK_DATE - now;

      if (diff <= 0) {
        clearInterval(countdownInterval);
        if (sessionStorage.getItem('tehrim_auth') === 'true') {
          showPermissionView();
        }
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

  if (btnGrantPermissions) {
    const handleGrant = async (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      btnGrantPermissions.disabled = true;
      btnGrantPermissions.textContent = 'opening...';
      btnGrantPermissions.style.opacity = '0.7';

      try {
        await requestSensors();
      } catch (err) {
        console.warn('Sensors error:', err);
      }
      sessionStorage.setItem('sensors_granted', 'true');
      unlockSite();
    };

    btnGrantPermissions.addEventListener('click', handleGrant);
    btnGrantPermissions.addEventListener('touchend', handleGrant, { passive: false });
  }

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
        lockStarIcon.style.color = '#ff758f';
        lockStarIcon.style.transform = 'scale(1.25)';
        if (sessionStorage.getItem('tehrim_auth') === 'true') {
          showPermissionView();
        }
      } else {
        starTimer = setTimeout(() => { starTaps = 0; }, 1000);
      }
    });
  }

  // Check if already authenticated during this session
  if (sessionStorage.getItem('tehrim_auth') === 'true') {
    if (isUnlockedDate()) {
      if (sessionStorage.getItem('sensors_granted') === 'true') {
        stageLock.classList.add('hidden');
        stageEnvelope.classList.remove('hidden');
      } else {
        showPermissionView();
      }
    } else {
      showCountdown();
      if (meadowCanvas) {
        countdownMeadow = new CountdownMeadow(meadowCanvas);
      }
    }
  } else {
    // Show living meadow on initial lock / countdown screen
    if (meadowCanvas) {
      countdownMeadow = new CountdownMeadow(meadowCanvas);
    }
  }

  const handleUnlockAttempt = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const val = lockInput.value;
    if (!val) return;

    try {
      const hash = await computeHash(val);

      // Secret Master Passcode: Skips countdown and opens birthday experience directly anytime
      if (hash === MASTER_HASH) {
        showPermissionView();
        return;
      }

      // Standard Birthday Passcode: Checks date gate
      if (hash === TARGET_HASH) {
        if (isUnlockedDate()) {
          showPermissionView();
        } else {
          showCountdown();
        }
        return;
      }

      // Neither matched
      lockError.textContent = 'incorrect secret word';
      lockCard.classList.remove('shake-anim');
      void lockCard.offsetWidth; // re-trigger animation
      lockCard.classList.add('shake-anim');
      lockInput.value = '';
      lockInput.focus();
    } catch (err) {
      console.error('Unlock verification error:', err);
      const fallback = fallbackSha256(`${SALT}:${val.trim().toLowerCase()}`);
      if (fallback === MASTER_HASH) {
        showPermissionView();
      } else if (fallback === TARGET_HASH) {
        if (isUnlockedDate()) {
          showPermissionView();
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
  window.__hologramViewer = hologramViewer;

  // Microphone Blow Detection & Cake Scene References
  let micDetector = null;
  let cakeScene = null;

  // Request iOS permissions immediately upon direct user touch
  async function requestSensors() {
    const promises = [];

    // 1. iOS DeviceOrientation permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      promises.push(
        DeviceOrientationEvent.requestPermission()
          .then(res => {
            console.log('DeviceOrientation permission:', res);
            if (res === 'granted' && hologramViewer) {
              hologramViewer.recalibrate();
            }
          })
          .catch(err => console.warn('DeviceOrientation err:', err))
      );
    }

    // 2. Microphone access for blowing out the candle
    if (!micDetector) {
      micDetector = new MicBlowDetector(() => {
        if (cakeScene && !cakeScene.isBlownOut) {
          cakeScene.blowOut();
        }
      });
      promises.push(micDetector.start());
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  // STAGE 1: TAP WAX SEAL / ENVELOPE
  let isEnvelopeOpening = false;
  const handleOpenEnvelope = async () => {
    if (isEnvelopeOpening) return;
    isEnvelopeOpening = true;

    startMusic();

    // Fallback: If permissions were not granted yet, await them before revealing the letter
    if (sessionStorage.getItem('sensors_granted') !== 'true') {
      try {
        await requestSensors();
      } catch (err) {
        console.warn('Sensors fallback error:', err);
      }
      sessionStorage.setItem('sensors_granted', 'true');
    }

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
      if (cakeCenterpiece) {
        cakeCenterpiece.style.cursor = 'pointer';
        cakeCenterpiece.onclick = () => {
          if (cakeScene) cakeScene.blowOut();
        };
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

  // STAGE 4: BUILD FAIRY LIGHT CLOTHESLINE WALL (3 STRINGS, 16 POLAROIDS)
  const rows = [
    MEMORIES.slice(0, 5),
    MEMORIES.slice(5, 10),
    MEMORIES.slice(10, 16)
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
    const numBulbs = rowMemories.length >= 6 ? 10 : 8;
    for (let b = 0; b < numBulbs; b++) {
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
      if (mem.id === 'mem_stargaze') {
        item.classList.add('polaroid-stargaze-easteregg');
      }
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
  let currentModalMemory = null;

  hologramViewer.onTilt = (mouse) => {
    if (currentModalMemory && currentModalMemory.id === 'mem_stargaze') {
      const tilt = mouse.length();
      if (tilt > 0.72) {
        hologramDate.textContent = 'look who finally stopped hiding ✦';
        hologramDate.style.color = '#c88636';
      } else if (tilt < 0.48) {
        hologramDate.textContent = currentModalMemory.date;
        hologramDate.style.color = '#2b2824';
      }
    }
  };

  const openHologramModal = (mem) => {
    currentModalMemory = mem;
    requestSensors();
    hologramDate.textContent = mem.date;
    hologramDate.style.color = '#2b2824';
    hologramViewer.recalibrate();
    hologramViewer.loadMemory(mem.photo, mem.depth, mem.overlay || null);
    modalHologram.classList.add('active');
    document.body.style.overflow = 'hidden'; // lock background scroll while modal open
  };

  const closeHologramModal = () => {
    modalHologram.classList.remove('active');
    document.body.style.overflow = 'auto'; // restore natural scrolling
    hologramViewer.recalibrate();
    currentModalMemory = null;
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
